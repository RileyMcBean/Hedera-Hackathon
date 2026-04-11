"""
App-layer pipeline entry point.

Thin shim used by the Streamlit demo (app/demo.py) and the CLI (main.py).
Delegates to src/runtime/pipeline.py — do not add business logic here.

Phase 1: run_policy_only()  — context + policy, no Hedera
Phase 2: run()              — will add execution + audit once Hedera adapters exist
"""

from __future__ import annotations

from src.runtime.pipeline import PipelineResult, PipelineStage, run_policy_only
from src.schemas.action import Action

__all__ = ["PipelineResult", "PipelineStage", "run_policy_only"]


def run(action: Action) -> PipelineResult:
    """
    Full governed payout pipeline (phase 2 stub).

    Currently delegates to run_policy_only().  When src/hedera/transfer.py
    and src/audit/trail.py are implemented, this function will:
      1. Call run_policy_only(action)
      2. If approved: execute HBAR transfer, populate result.tx_id
      3. Write HCS audit entry, populate result.hcs_topic_id + hcs_sequence_number
      4. Return result with stage=AUDITED

    Args:
        action: Structured payout action.

    Returns:
        PipelineResult — stage=POLICY_EVALUATED until phase 2 is wired.
    """
    return run_policy_only(action)
