"""
AuditMessage — the payload written to HCS for every decision.

Both approved and denied actions produce an AuditMessage.  The full context
is embedded so that any party can replay and verify the decision independently.
"""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field

from src.schemas.action import Action
from src.schemas.policy import PolicyResult


class ParseResult(BaseModel):
    """Outcome of the instruction parsing step."""

    confidence: float = 1.0
    proceeded: bool = True
    detail: str = ""


class AuditMessage(BaseModel):
    """Immutable evidence record submitted to the HCS audit topic."""

    correlation_id: str            # matches Action.correlation_id
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    action: Action
    parse_result: ParseResult | None = None
    policy_result: PolicyResult
    tx_id: str = ""               # Hedera transaction ID (populated on APPROVED path)
    topic_id: str = ""            # HCS topic ID (populated after submission)
    sequence_number: int = -1     # HCS sequence number (populated after submission)
