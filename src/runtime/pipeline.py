"""
Runtime Pipeline — orchestration layer for Sika Sentinel.

Wires context loading and policy evaluation into a single, typed end-to-end
step.  Designed to be extended in phases without changing call sites:

  Phase 1 (this file)   run_policy_only()  → context + policy decision
  Phase 2 (next)        run()              → + Hedera execution + HCS audit

Architectural contract
----------------------
- No Hedera dependencies.
- No LLM logic.
- No side effects (no network calls, no file writes).
- All failure modes return a structured PipelineResult; nothing is raised
  to the caller except PipelineError for genuinely unexpected exceptions.
- PipelineResult fields are additive: phase 2 populates tx_id, hcs_*
  without changing the model — existing consumers see the same fields.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field

from src.context.loader import ContextSnapshot, load_context
from src.policy.engine import evaluate_policy
from src.schemas.action import Action
from src.schemas.policy import PolicyResult

logger = logging.getLogger(__name__)


# ── Pipeline stage ────────────────────────────────────────────────────────────

class PipelineStage(str, Enum):
    """
    Tracks how far through the pipeline a result has progressed.

    POLICY_EVALUATED  — context loaded and policy decided; no execution yet
    EXECUTED          — approved action executed on Hedera (phase 2)
    AUDITED           — decision written to HCS audit topic (phase 2)
    ERROR             — pipeline aborted before policy evaluation (e.g. unknown actor)
    """
    POLICY_EVALUATED = "POLICY_EVALUATED"
    EXECUTED         = "EXECUTED"
    AUDITED          = "AUDITED"
    ERROR            = "ERROR"


# ── Pipeline result ───────────────────────────────────────────────────────────

class PipelineResult(BaseModel):
    """
    Structured output of a pipeline run.

    Phase 1 fields (always populated on non-ERROR results):
      action, context, policy_result, stage, timestamp

    Phase 2 fields (populated by run() after Hedera execution / HCS write):
      tx_id, hcs_topic_id, hcs_sequence_number

    Error field (populated only when stage == ERROR):
      error
    """

    # Core pipeline outputs
    action: Action
    context: ContextSnapshot | None = None
    policy_result: PolicyResult | None = None
    stage: PipelineStage
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Phase 2 — Hedera execution (populated by run(), empty here)
    tx_id: str = ""

    # Phase 2 — HCS audit (populated by run(), empty here)
    hcs_topic_id: str = ""
    hcs_sequence_number: int = -1

    # Error path
    error: str = ""

    # ── Convenience properties ────────────────────────────────────────────────

    @property
    def approved(self) -> bool:
        """True only when the policy engine returned APPROVED."""
        from src.schemas.policy import Decision
        return (
            self.policy_result is not None
            and self.policy_result.decision == Decision.APPROVED
        )

    @property
    def decision_label(self) -> str:
        """Human-readable one-word summary for UI display."""
        if self.stage == PipelineStage.ERROR:
            return "ERROR"
        if self.policy_result is None:
            return "UNKNOWN"
        return self.policy_result.decision.value


# ── Public exception ──────────────────────────────────────────────────────────

class PipelineError(RuntimeError):
    """
    Raised only for unexpected internal failures (not policy denials, not
    unknown actors).  Normal failure modes are encoded in PipelineResult.
    """


# ── Phase 1: policy-only pipeline ────────────────────────────────────────────

def run_policy_only(action: Action) -> PipelineResult:
    """
    Load context and evaluate policy for a structured action.

    No Hedera calls are made.  The returned PipelineResult has
    stage=POLICY_EVALUATED on success, or stage=ERROR if the actor is
    not registered in the context store.

    Args:
        action: A fully-populated Action (produced by the intent parser or
                constructed directly in tests / the Streamlit UI).

    Returns:
        PipelineResult with context and policy_result populated.

    Raises:
        PipelineError: Only for unexpected exceptions not related to actor
                       lookup or policy evaluation.
    """
    logger.info(
        "Pipeline run_policy_only | correlation_id=%s actor=%s recipient=%s amount=%.4f",
        action.correlation_id,
        action.actor_id,
        action.recipient_id,
        action.amount_hbar,
    )

    # ── Step 1: load context ──────────────────────────────────────────────────
    try:
        context = load_context(action.actor_id, action.recipient_id)
    except KeyError as exc:
        logger.warning("Context load failed: %s", exc)
        return PipelineResult(
            action=action,
            context=None,
            policy_result=None,
            stage=PipelineStage.ERROR,
            error=str(exc),
        )
    except Exception as exc:
        raise PipelineError(f"Unexpected error loading context: {exc}") from exc

    # ── Step 2: evaluate policy ───────────────────────────────────────────────
    try:
        policy_result = evaluate_policy(action, context)
    except Exception as exc:
        raise PipelineError(f"Unexpected error evaluating policy: {exc}") from exc

    logger.info(
        "Pipeline decision=%s | correlation_id=%s rules=%s",
        policy_result.decision.value,
        action.correlation_id,
        policy_result.evaluated_rules,
    )

    return PipelineResult(
        action=action,
        context=context,
        policy_result=policy_result,
        stage=PipelineStage.POLICY_EVALUATED,
    )
