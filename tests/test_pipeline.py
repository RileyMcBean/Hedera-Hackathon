"""
Tests for src/runtime/pipeline.py — run_policy_only().

All tests are pure Python: no Hedera dependencies, no network calls.
The context store cache is reset before each test so the in-memory
fallback is used consistently.
"""

from __future__ import annotations

import pytest

from src.context.loader import reload_store, set_treasury_posture, TreasuryPosture
from src.runtime.pipeline import PipelineError, PipelineResult, PipelineStage, run_policy_only
from src.schemas.action import Action, ActionType
from src.schemas.policy import Decision, DenialReason


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_context_store():
    """Each test starts with a clean in-memory context store."""
    reload_store()
    yield
    reload_store()


def make_action(**overrides) -> Action:
    """Valid approved action by default (actor 0.0.100 exists in the fallback store)."""
    defaults = dict(
        action_type=ActionType.HBAR_TRANSFER,
        actor_id="0.0.100",
        recipient_id="0.0.800",
        amount_hbar=5.0,
        raw_instruction="Send 5 HBAR to 0.0.800",
    )
    return Action(**(defaults | overrides))


# ── Return type ───────────────────────────────────────────────────────────────

def test_returns_pipeline_result():
    result = run_policy_only(make_action())
    assert isinstance(result, PipelineResult)


def test_result_carries_original_action():
    action = make_action()
    result = run_policy_only(action)
    assert result.action.correlation_id == action.correlation_id


def test_result_carries_context():
    result = run_policy_only(make_action())
    assert result.context is not None
    assert result.context.actor_id == "0.0.100"


def test_result_carries_policy_result():
    result = run_policy_only(make_action())
    assert result.policy_result is not None


def test_result_has_timestamp():
    result = run_policy_only(make_action())
    assert result.timestamp is not None


# ── Happy path: APPROVED ──────────────────────────────────────────────────────

def test_valid_transfer_is_approved():
    result = run_policy_only(make_action())
    assert result.policy_result.decision == Decision.APPROVED
    assert result.stage == PipelineStage.POLICY_EVALUATED


def test_approved_property_true_on_approval():
    result = run_policy_only(make_action())
    assert result.approved is True


def test_decision_label_approved():
    result = run_policy_only(make_action())
    assert result.decision_label == "APPROVED"


# ── Policy denials ────────────────────────────────────────────────────────────

def test_missing_recipient_is_denied():
    result = run_policy_only(make_action(recipient_id=""))
    assert result.policy_result.decision == Decision.DENIED
    assert result.policy_result.denial_reason == DenialReason.MISSING_RECIPIENT
    assert result.stage == PipelineStage.POLICY_EVALUATED


def test_zero_amount_is_denied():
    result = run_policy_only(make_action(amount_hbar=0.0))
    assert result.policy_result.decision == Decision.DENIED
    assert result.policy_result.denial_reason == DenialReason.INVALID_AMOUNT


def test_negative_amount_is_denied():
    result = run_policy_only(make_action(amount_hbar=-10.0))
    assert result.policy_result.decision == Decision.DENIED
    assert result.policy_result.denial_reason == DenialReason.INVALID_AMOUNT


def test_unapproved_recipient_is_denied():
    # 0.0.100's approved list is ["0.0.800", "0.0.801"]
    result = run_policy_only(make_action(recipient_id="0.0.999"))
    assert result.policy_result.decision == Decision.DENIED
    assert result.policy_result.denial_reason == DenialReason.RECIPIENT_NOT_APPROVED


def test_frozen_treasury_is_denied():
    set_treasury_posture(TreasuryPosture.FROZEN)
    result = run_policy_only(make_action())
    assert result.policy_result.decision == Decision.DENIED
    assert result.policy_result.denial_reason == DenialReason.TREASURY_FROZEN


# ── Non-approved non-denied outcomes ─────────────────────────────────────────

def test_amount_above_threshold_requires_approval():
    # 0.0.100 threshold is 100 HBAR
    result = run_policy_only(make_action(amount_hbar=101.0))
    assert result.policy_result.decision == Decision.APPROVAL_REQUIRED
    assert result.approved is False


def test_restricted_treasury_triggers_manual_review():
    set_treasury_posture(TreasuryPosture.RESTRICTED)
    result = run_policy_only(make_action())
    assert result.policy_result.decision == Decision.MANUAL_REVIEW
    assert result.stage == PipelineStage.POLICY_EVALUATED


# ── Denial result properties ──────────────────────────────────────────────────

def test_denied_result_approved_property_is_false():
    result = run_policy_only(make_action(recipient_id="0.0.999"))
    assert result.approved is False


def test_denied_result_has_decision_label():
    result = run_policy_only(make_action(recipient_id="0.0.999"))
    assert result.decision_label == "DENIED"


def test_denied_result_has_denial_detail():
    result = run_policy_only(make_action(recipient_id="0.0.999"))
    assert result.policy_result.denial_detail != ""


# ── Unknown actor (ERROR stage) ───────────────────────────────────────────────

def test_unknown_actor_returns_error_stage():
    result = run_policy_only(make_action(actor_id="0.0.999"))
    assert result.stage == PipelineStage.ERROR
    assert result.context is None
    assert result.policy_result is None


def test_unknown_actor_error_message_contains_id():
    result = run_policy_only(make_action(actor_id="0.0.999"))
    assert "0.0.999" in result.error


def test_unknown_actor_approved_is_false():
    result = run_policy_only(make_action(actor_id="0.0.999"))
    assert result.approved is False


def test_unknown_actor_decision_label_is_error():
    result = run_policy_only(make_action(actor_id="0.0.999"))
    assert result.decision_label == "ERROR"


# ── Phase 2 placeholder fields ────────────────────────────────────────────────

def test_phase2_fields_are_empty_in_phase1():
    result = run_policy_only(make_action())
    assert result.tx_id == ""
    assert result.hcs_topic_id == ""
    assert result.hcs_sequence_number == -1


# ── Correlation ID is preserved end-to-end ────────────────────────────────────

def test_correlation_id_preserved_through_pipeline():
    action = make_action()
    result = run_policy_only(action)
    assert result.action.correlation_id == action.correlation_id


# ── app/pipeline shim ─────────────────────────────────────────────────────────

def test_app_pipeline_run_delegates_to_runtime():
    from app.pipeline import run
    result = run(make_action())
    assert isinstance(result, PipelineResult)
    assert result.policy_result.decision == Decision.APPROVED
