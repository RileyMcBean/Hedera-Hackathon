"""
Policy / Clearance Engine — deterministic rule evaluation.

Receives a structured Action and a loaded ContextSnapshot, applies an ordered
set of named rules, and returns a PolicyResult.

Design contract
---------------
- The model interprets intent; this engine decides whether money moves.
- Rules are evaluated in a fixed order; the first failure short-circuits.
- Every rule that is *checked* is recorded in PolicyResult.evaluated_rules
  so the audit trail shows exactly which rules ran, not just the outcome.
- No Hedera dependencies. No LLM logic. Pure Python + Pydantic.

Rule catalogue (MVP)
--------------------
  R001  RECIPIENT_PRESENT     deny  if recipient_id is blank (transfer/payout)
  R002  AMOUNT_VALID          deny  if amount_hbar is missing or <= 0
  R003  ACTOR_AUTHORISED      deny  if actor role is not in the permitted set
  R004  TREASURY_NOT_FROZEN   deny  if treasury posture is FROZEN
  R005  RECIPIENT_APPROVED    deny  if recipient is not on actor's approved list
                                    (skipped when the approved list is empty —
                                     empty list means "open access" for that actor)
  R006  AMOUNT_WITHIN_LIMIT   APPROVAL_REQUIRED if amount exceeds actor threshold
  R007  TREASURY_NOT_RESTRICTED  MANUAL_REVIEW if treasury posture is RESTRICTED

Adding a new rule
-----------------
1. Define a _RuleID constant string.
2. Write a private _check_<name>() function — signature: (Action, ContextSnapshot)
   -> PolicyResult | None.  Return None if the rule passes.
3. Append it to _RULES in order.
"""

from __future__ import annotations

import logging

from src.context.loader import ActorRole, ContextSnapshot, TreasuryPosture
from src.schemas.action import Action, ActionType
from src.schemas.policy import Decision, DenialReason, PolicyResult

logger = logging.getLogger(__name__)

# ── Rule IDs ──────────────────────────────────────────────────────────────────
# String constants so they appear verbatim in PolicyResult.evaluated_rules
# and in HCS audit messages without relying on enum serialisation.

R001 = "R001:RECIPIENT_PRESENT"
R002 = "R002:AMOUNT_VALID"
R003 = "R003:ACTOR_AUTHORISED"
R004 = "R004:TREASURY_NOT_FROZEN"
R005 = "R005:RECIPIENT_APPROVED"
R006 = "R006:AMOUNT_WITHIN_LIMIT"
R007 = "R007:TREASURY_NOT_RESTRICTED"

# Action types that involve moving funds — rules 1/2/5/6/7 only apply here.
_TRANSFER_TYPES: frozenset[ActionType] = frozenset({ActionType.HBAR_TRANSFER})

# Roles permitted to submit transfer/payout actions.
_AUTHORISED_ROLES: frozenset[ActorRole] = frozenset({
    ActorRole.OPERATOR,
    ActorRole.PARTNER,
    ActorRole.ADMIN,
})


# ── Individual rule checkers ──────────────────────────────────────────────────
# Each returns None (rule passes) or a PolicyResult (rule fires → short-circuit).

def _check_recipient_present(action: Action, context: ContextSnapshot) -> PolicyResult | None:
    """R001 — transfer actions must have a non-blank recipient."""
    if action.action_type not in _TRANSFER_TYPES:
        return None
    if not action.recipient_id or not action.recipient_id.strip():
        return PolicyResult(
            decision=Decision.DENIED,
            denial_reason=DenialReason.MISSING_RECIPIENT,
            denial_detail="A recipient account ID is required for transfer actions.",
            evaluated_rules=[R001],
        )
    return None


def _check_amount_valid(action: Action, context: ContextSnapshot) -> PolicyResult | None:
    """R002 — transfer actions must carry a positive HBAR amount."""
    if action.action_type not in _TRANSFER_TYPES:
        return None
    if action.amount_hbar is None or action.amount_hbar <= 0:
        return PolicyResult(
            decision=Decision.DENIED,
            denial_reason=DenialReason.INVALID_AMOUNT,
            denial_detail=(
                f"Transfer amount must be greater than zero "
                f"(received: {action.amount_hbar!r} HBAR)."
            ),
            evaluated_rules=[R001, R002],
        )
    return None


def _check_actor_authorised(action: Action, context: ContextSnapshot) -> PolicyResult | None:
    """R003 — only recognised roles may initiate actions."""
    if context.actor_role not in _AUTHORISED_ROLES:
        return PolicyResult(
            decision=Decision.DENIED,
            denial_reason=DenialReason.ACTOR_NOT_AUTHORISED,
            denial_detail=(
                f"Actor '{context.actor_id}' has role '{context.actor_role.value}' "
                f"which is not permitted to perform '{action.action_type.value}' actions. "
                f"Permitted roles: {[r.value for r in _AUTHORISED_ROLES]}."
            ),
            evaluated_rules=[R001, R002, R003],
        )
    return None


def _check_treasury_not_frozen(action: Action, context: ContextSnapshot) -> PolicyResult | None:
    """R004 — a frozen treasury blocks all transfer/payout actions outright."""
    if action.action_type not in _TRANSFER_TYPES:
        return None
    if context.treasury_posture == TreasuryPosture.FROZEN:
        return PolicyResult(
            decision=Decision.DENIED,
            denial_reason=DenialReason.TREASURY_FROZEN,
            denial_detail=(
                "Treasury is currently FROZEN. All transfers are suspended "
                "until the treasury posture is restored to NORMAL."
            ),
            evaluated_rules=[R001, R002, R003, R004],
        )
    return None


def _check_recipient_approved(action: Action, context: ContextSnapshot) -> PolicyResult | None:
    """R005 — recipient must be on the actor's approved list.

    Skipped entirely when context.enforce_recipient_allowlist is False,
    giving that actor open access regardless of the approved_recipients list.
    """
    if action.action_type not in _TRANSFER_TYPES:
        return None
    if not context.enforce_recipient_allowlist:
        return None
    if action.recipient_id not in context.approved_recipients:
        return PolicyResult(
            decision=Decision.DENIED,
            denial_reason=DenialReason.RECIPIENT_NOT_APPROVED,
            denial_detail=(
                f"Recipient '{action.recipient_id}' is not on the approved list "
                f"for actor '{context.actor_id}'. "
                f"Approved: {context.approved_recipients}."
            ),
            evaluated_rules=[R001, R002, R003, R004, R005],
        )
    return None


def _check_amount_within_limit(action: Action, context: ContextSnapshot) -> PolicyResult | None:
    """R006 — amounts exceeding the actor's threshold require explicit approval."""
    if action.action_type not in _TRANSFER_TYPES:
        return None
    if action.amount_hbar > context.amount_threshold_hbar:
        return PolicyResult(
            decision=Decision.APPROVAL_REQUIRED,
            denial_reason=DenialReason.AMOUNT_EXCEEDS_THRESHOLD,
            denial_detail=(
                f"Requested amount {action.amount_hbar} HBAR exceeds the threshold "
                f"of {context.amount_threshold_hbar} HBAR for actor '{context.actor_id}'. "
                f"Human approval is required before execution."
            ),
            evaluated_rules=[R001, R002, R003, R004, R005, R006],
        )
    return None


def _check_treasury_not_restricted(action: Action, context: ContextSnapshot) -> PolicyResult | None:
    """R007 — a restricted treasury routes transfer/payout actions to manual review."""
    if action.action_type not in _TRANSFER_TYPES:
        return None
    if context.treasury_posture == TreasuryPosture.RESTRICTED:
        return PolicyResult(
            decision=Decision.MANUAL_REVIEW,
            denial_reason=DenialReason.TREASURY_RESTRICTED,
            denial_detail=(
                "Treasury is currently RESTRICTED. This transfer has been routed "
                "to the compliance queue for manual review before execution."
            ),
            evaluated_rules=[R001, R002, R003, R004, R005, R006, R007],
        )
    return None


# ── Rule pipeline ─────────────────────────────────────────────────────────────
# Order is significant: first match short-circuits. Add new rules here.

_RULES = [
    _check_recipient_present,      # R001
    _check_amount_valid,           # R002
    _check_actor_authorised,       # R003
    _check_treasury_not_frozen,    # R004
    _check_recipient_approved,     # R005
    _check_amount_within_limit,    # R006
    _check_treasury_not_restricted, # R007
]

_ALL_RULE_IDS = [R001, R002, R003, R004, R005, R006, R007]


# ── Public API ────────────────────────────────────────────────────────────────

def evaluate_policy(action: Action, context: ContextSnapshot) -> PolicyResult:
    """
    Apply the deterministic clearance rule pipeline to a payout action.

    Rules are evaluated in the order defined by _RULES.  The first rule that
    fires terminates evaluation and its result is returned (short-circuit).
    If all rules pass, APPROVED is returned with the full rule trace.

    Args:
        action:  The structured payout instruction to evaluate.
        context: Policy-relevant state loaded for this action.

    Returns:
        A PolicyResult with decision, optional denial reason, human-readable
        detail, and the list of rule IDs that were evaluated.
    """
    logger.debug(
        "Evaluating policy for action=%s actor=%s recipient=%s amount=%.4f HBAR",
        action.action_type.value,
        context.actor_id,
        action.recipient_id,
        action.amount_hbar,
    )

    for rule_fn in _RULES:
        result = rule_fn(action, context)
        if result is not None:
            logger.info(
                "Policy %s [%s] — actor=%s correlation_id=%s",
                result.decision.value,
                result.evaluated_rules[-1] if result.evaluated_rules else "?",
                context.actor_id,
                action.correlation_id,
            )
            return result

    # All rules passed.
    logger.info(
        "Policy APPROVED — actor=%s correlation_id=%s",
        context.actor_id,
        action.correlation_id,
    )
    return PolicyResult(
        decision=Decision.APPROVED,
        evaluated_rules=_ALL_RULE_IDS,
    )


# Backwards-compatible alias — app/pipeline.py calls engine.evaluate()
evaluate = evaluate_policy
