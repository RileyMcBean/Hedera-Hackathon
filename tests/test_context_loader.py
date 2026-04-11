"""
Tests for src/context/loader.py.

All tests run without any Hedera dependencies or network access.
The module-level store cache is reset before each test via reload_store().
"""

import pytest

from src.context.loader import (
    ActorRole,
    ContextSnapshot,
    PolicyContext,
    TreasuryPosture,
    get_treasury_posture,
    load_context,
    reload_store,
    set_treasury_posture,
)


@pytest.fixture(autouse=True)
def reset_store():
    """Ensure each test starts with a clean store (uses the in-memory fallback)."""
    reload_store()
    yield
    reload_store()


# ── load_context ──────────────────────────────────────────────────────────────

def test_loads_known_operator():
    ctx = load_context("0.0.100")
    assert ctx.actor_id == "0.0.100"
    assert ctx.actor_role == ActorRole.OPERATOR
    assert ctx.partner_id == "partner-alpha"
    assert ctx.amount_threshold_hbar == 100.0
    assert "0.0.800" in ctx.approved_recipients
    assert ctx.enforce_recipient_allowlist is True


def test_loads_known_partner():
    ctx = load_context("0.0.200")
    assert ctx.actor_role == ActorRole.PARTNER
    assert ctx.amount_threshold_hbar == 25.0
    assert ctx.enforce_recipient_allowlist is True


def test_recipient_id_is_optional():
    # recipient_id is accepted but does not affect what is returned
    ctx_with = load_context("0.0.100", recipient_id="0.0.800")
    ctx_without = load_context("0.0.100")
    assert ctx_with == ctx_without


def test_unknown_actor_raises_key_error():
    with pytest.raises(KeyError, match="0.0.999"):
        load_context("0.0.999")


def test_returns_context_snapshot_instance():
    ctx = load_context("0.0.100")
    assert isinstance(ctx, ContextSnapshot)


def test_policy_context_alias():
    # PolicyContext must remain importable for backwards compat
    assert PolicyContext is ContextSnapshot


# ── treasury posture ──────────────────────────────────────────────────────────

def test_default_treasury_posture_is_normal():
    ctx = load_context("0.0.100")
    assert ctx.treasury_posture == TreasuryPosture.NORMAL


def test_get_treasury_posture():
    assert get_treasury_posture() == TreasuryPosture.NORMAL


def test_set_treasury_posture_reflected_in_load_context():
    set_treasury_posture(TreasuryPosture.FROZEN)
    ctx = load_context("0.0.100")
    assert ctx.treasury_posture == TreasuryPosture.FROZEN


def test_set_treasury_posture_reflected_in_get():
    set_treasury_posture(TreasuryPosture.RESTRICTED)
    assert get_treasury_posture() == TreasuryPosture.RESTRICTED


# ── store loaded from JSON file ───────────────────────────────────────────────

def test_loads_from_json_file(tmp_path, monkeypatch):
    store_file = tmp_path / "context_store.json"
    store_file.write_text(
        """{
            "treasury": {"posture": "RESTRICTED"},
            "actors": {
                "0.0.999": {
                    "role": "PARTNER",
                    "partner_id": "test-partner",
                    "amount_threshold_hbar": 10.0,
                    "approved_recipients": ["0.0.111"],
                    "enforce_recipient_allowlist": true
                }
            }
        }""",
        encoding="utf-8",
    )
    monkeypatch.setenv("CONTEXT_STORE_PATH", str(store_file))
    reload_store()

    ctx = load_context("0.0.999")
    assert ctx.actor_role == ActorRole.PARTNER
    assert ctx.partner_id == "test-partner"
    assert ctx.amount_threshold_hbar == 10.0
    assert ctx.treasury_posture == TreasuryPosture.RESTRICTED
    assert ctx.enforce_recipient_allowlist is True


def test_enforce_flag_false_loaded_from_json(tmp_path, monkeypatch):
    store_file = tmp_path / "context_store.json"
    store_file.write_text(
        """{
            "treasury": {"posture": "NORMAL"},
            "actors": {
                "0.0.400": {
                    "role": "ADMIN",
                    "partner_id": "open-access",
                    "amount_threshold_hbar": 1000.0,
                    "approved_recipients": [],
                    "enforce_recipient_allowlist": false
                }
            }
        }""",
        encoding="utf-8",
    )
    monkeypatch.setenv("CONTEXT_STORE_PATH", str(store_file))
    reload_store()

    ctx = load_context("0.0.400")
    assert ctx.enforce_recipient_allowlist is False


def test_enforce_flag_defaults_to_true_when_omitted(tmp_path, monkeypatch):
    """Omitting enforce_recipient_allowlist from JSON defaults to True (safe default)."""
    store_file = tmp_path / "context_store.json"
    store_file.write_text(
        """{
            "treasury": {"posture": "NORMAL"},
            "actors": {
                "0.0.500": {
                    "role": "OPERATOR",
                    "partner_id": "legacy-actor",
                    "amount_threshold_hbar": 50.0,
                    "approved_recipients": ["0.0.800"]
                }
            }
        }""",
        encoding="utf-8",
    )
    monkeypatch.setenv("CONTEXT_STORE_PATH", str(store_file))
    reload_store()

    ctx = load_context("0.0.500")
    assert ctx.enforce_recipient_allowlist is True


def test_falls_back_to_in_memory_when_file_missing(monkeypatch):
    monkeypatch.setenv("CONTEXT_STORE_PATH", "/nonexistent/path/context_store.json")
    reload_store()
    # Fallback store contains 0.0.100
    ctx = load_context("0.0.100")
    assert ctx.actor_id == "0.0.100"


def test_falls_back_to_in_memory_when_file_invalid(tmp_path, monkeypatch):
    bad_file = tmp_path / "context_store.json"
    bad_file.write_text("not valid json", encoding="utf-8")
    monkeypatch.setenv("CONTEXT_STORE_PATH", str(bad_file))
    reload_store()
    ctx = load_context("0.0.100")
    assert ctx.actor_id == "0.0.100"
