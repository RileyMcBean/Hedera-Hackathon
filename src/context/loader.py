"""
Context Engine — loads policy-relevant state for an Action.

Supplies the clearance engine with everything it needs to evaluate an action:
  - actor role and partner identity
  - approved recipient list (per actor)
  - per-actor HBAR transfer threshold
  - current treasury posture (NORMAL | RESTRICTED | FROZEN)

Store resolution order:
  1. Path given by the CONTEXT_STORE_PATH environment variable
  2. scripts/context_store.json  (default fixture location)
  3. Built-in in-memory fallback  (demo always works, even without a file)

Post-hackathon: replace the file backend with a database-backed service.
No Hedera dependencies; pure Python + Pydantic.
"""

from __future__ import annotations

import json
import logging
import os
from enum import Enum
from pathlib import Path

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ── Enums ─────────────────────────────────────────────────────────────────────

class TreasuryPosture(str, Enum):
    NORMAL = "NORMAL"
    RESTRICTED = "RESTRICTED"
    FROZEN = "FROZEN"


class ActorRole(str, Enum):
    OPERATOR = "OPERATOR"
    PARTNER = "PARTNER"
    ADMIN = "ADMIN"


# ── ContextSnapshot ───────────────────────────────────────────────────────────

class ContextSnapshot(BaseModel):
    """
    Immutable policy-relevant state for a single action evaluation.

    Produced by load_context() and consumed by the clearance engine.
    Embedded in AuditMessage so the full decision context is on-ledger.
    """

    actor_id: str
    actor_role: ActorRole
    partner_id: str                          # logical partner / org identifier
    amount_threshold_hbar: float             # max single-transfer for this actor
    approved_recipients: list[str] = Field(default_factory=list)
    treasury_posture: TreasuryPosture = TreasuryPosture.NORMAL
    enforce_recipient_allowlist: bool = True
    # When True  — R005 denies any recipient not in approved_recipients.
    # When False — R005 is skipped entirely (open access for this actor).
    # Actors with an empty approved_recipients list and enforce=True will
    # deny *all* recipients; set enforce=False for genuinely open actors.


# Backwards-compatible alias used by existing tests
PolicyContext = ContextSnapshot


# ── Store schema (internal) ───────────────────────────────────────────────────

class _ActorRecord(BaseModel):
    role: ActorRole
    partner_id: str
    amount_threshold_hbar: float
    approved_recipients: list[str] = Field(default_factory=list)
    enforce_recipient_allowlist: bool = True


class _TreasuryRecord(BaseModel):
    posture: TreasuryPosture = TreasuryPosture.NORMAL


class _ContextStore(BaseModel):
    treasury: _TreasuryRecord = Field(default_factory=_TreasuryRecord)
    actors: dict[str, _ActorRecord] = Field(default_factory=dict)


# ── In-memory fallback (demo default) ────────────────────────────────────────

_FALLBACK_STORE = _ContextStore(
    treasury=_TreasuryRecord(posture=TreasuryPosture.NORMAL),
    actors={
        # Demo operator — permitted to send up to 100 HBAR to approved partners
        "0.0.100": _ActorRecord(
            role=ActorRole.OPERATOR,
            partner_id="partner-alpha",
            amount_threshold_hbar=100.0,
            approved_recipients=["0.0.800", "0.0.801"],
            enforce_recipient_allowlist=True,
        ),
        # Demo partner with a tighter threshold
        "0.0.200": _ActorRecord(
            role=ActorRole.PARTNER,
            partner_id="partner-beta",
            amount_threshold_hbar=25.0,
            approved_recipients=["0.0.800"],
            enforce_recipient_allowlist=True,
        ),
    },
)

# Module-level cache: loaded once per process
_store: _ContextStore | None = None


# ── Store loading ─────────────────────────────────────────────────────────────

_DEFAULT_STORE_PATH = Path(__file__).resolve().parents[2] / "scripts" / "context_store.json"


def _resolve_store_path() -> Path:
    env_path = os.environ.get("CONTEXT_STORE_PATH")
    return Path(env_path) if env_path else _DEFAULT_STORE_PATH


def _load_store() -> _ContextStore:
    global _store
    if _store is not None:
        return _store

    path = _resolve_store_path()
    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            _store = _ContextStore.model_validate(raw)
            logger.info("Context store loaded from %s", path)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to parse context store at %s (%s); using fallback", path, exc)
            _store = _FALLBACK_STORE
    else:
        logger.info("Context store not found at %s; using in-memory fallback", path)
        _store = _FALLBACK_STORE

    return _store


def reload_store() -> None:
    """Force the module to re-read the store file on the next call to load_context().
    Useful in tests and when the file is updated at runtime."""
    global _store
    _store = None


# ── Public API ────────────────────────────────────────────────────────────────

def load_context(
    actor_id: str,
    recipient_id: str | None = None,
) -> ContextSnapshot:
    """
    Load policy-relevant context for the given actor.

    Args:
        actor_id:     Hedera account ID of the requesting actor (e.g. "0.0.100").
        recipient_id: Hedera account ID of the intended recipient.  Unused
                      during loading — the approved_recipients list returned
                      lets the policy engine decide whether this specific
                      recipient is permitted.

    Returns:
        A ContextSnapshot ready for the clearance engine.

    Raises:
        KeyError: If actor_id is not found in the context store.
    """
    store = _load_store()

    if actor_id not in store.actors:
        raise KeyError(
            f"Actor '{actor_id}' is not registered in the context store. "
            f"Known actors: {list(store.actors)}"
        )

    actor = store.actors[actor_id]

    return ContextSnapshot(
        actor_id=actor_id,
        actor_role=actor.role,
        partner_id=actor.partner_id,
        amount_threshold_hbar=actor.amount_threshold_hbar,
        approved_recipients=actor.approved_recipients,
        treasury_posture=store.treasury.posture,
        enforce_recipient_allowlist=actor.enforce_recipient_allowlist,
    )


def get_treasury_posture() -> TreasuryPosture:
    """Return the current treasury posture without loading a full actor context.
    Useful for quick health checks and admin tooling."""
    return _load_store().treasury.posture


def set_treasury_posture(posture: TreasuryPosture) -> None:
    """
    Override the in-memory treasury posture for the current process.

    Does NOT write back to the JSON file.  Call reload_store() after updating
    the file if you want the change to be durable across restarts.
    """
    store = _load_store()
    store.treasury.posture = posture
    logger.info("Treasury posture set to %s (in-memory only)", posture)
