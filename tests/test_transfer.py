"""
Tests for src/hedera/transfer.py.

All tests use the DryRunBackend (TRANSFER_BACKEND=dry_run) — no network calls,
no live credentials required.  The SDK and CLI backends are tested only for
their configuration-validation and error-handling paths.
"""

from __future__ import annotations

import pytest

from src.schemas.action import Action, ActionType
from src.hedera.transfer import (
    DryRunBackend,
    HederaConfig,
    HederaSdkBackend,
    HieroCLIBackend,
    TransferError,
    TransferResult,
    execute_hbar_transfer,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def use_dry_run_backend(monkeypatch):
    """Force dry-run backend for all tests unless overridden."""
    monkeypatch.setenv("TRANSFER_BACKEND", "dry_run")


@pytest.fixture()
def valid_env(monkeypatch):
    """Inject the minimum required env vars for HederaConfig.from_env()."""
    monkeypatch.setenv("HEDERA_NETWORK",      "testnet")
    monkeypatch.setenv("HEDERA_OPERATOR_ID",  "0.0.100")
    monkeypatch.setenv("HEDERA_OPERATOR_KEY", "302e..." )
    # Treasury not set → should default to operator values
    monkeypatch.delenv("HEDERA_TREASURY_ID",  raising=False)
    monkeypatch.delenv("HEDERA_TREASURY_KEY", raising=False)


def make_action(**overrides) -> Action:
    defaults = dict(
        action_type=ActionType.HBAR_TRANSFER,
        actor_id="0.0.100",
        recipient_id="0.0.800",
        amount_hbar=5.0,
        raw_instruction="Send 5 HBAR to 0.0.800",
    )
    return Action(**(defaults | overrides))


# ── TransferResult shape ──────────────────────────────────────────────────────

def test_transfer_result_is_dataclass(valid_env):
    result = execute_hbar_transfer(make_action())
    assert isinstance(result, TransferResult)


def test_result_carries_recipient(valid_env):
    result = execute_hbar_transfer(make_action(recipient_id="0.0.801"))
    assert result.recipient_id == "0.0.801"


def test_result_carries_amount(valid_env):
    result = execute_hbar_transfer(make_action(amount_hbar=12.5))
    assert result.amount_hbar == 12.5


def test_result_carries_network(valid_env):
    result = execute_hbar_transfer(make_action())
    assert result.network == "testnet"


def test_result_tx_id_is_non_empty(valid_env):
    result = execute_hbar_transfer(make_action())
    assert result.tx_id != ""


def test_result_status_dry_run(valid_env):
    result = execute_hbar_transfer(make_action())
    assert result.status == "DRY_RUN"


# ── Dry-run backend ───────────────────────────────────────────────────────────

def test_dry_run_tx_id_contains_correlation_id(valid_env):
    action = make_action()
    result = execute_hbar_transfer(action)
    assert action.correlation_id in result.tx_id


def test_dry_run_two_calls_produce_different_tx_ids(valid_env):
    r1 = execute_hbar_transfer(make_action())
    r2 = execute_hbar_transfer(make_action())
    # Each Action gets a fresh correlation_id → distinct tx_ids
    assert r1.tx_id != r2.tx_id


def test_dry_run_backend_directly():
    backend = DryRunBackend()
    config  = HederaConfig(
        network="testnet",
        operator_id="0.0.100",
        operator_key="key",
        treasury_id="0.0.100",
        treasury_key="key",
    )
    action = make_action()
    result = backend.transfer(action, config)
    assert result.status == "DRY_RUN"
    assert result.recipient_id == action.recipient_id


# ── HederaConfig ──────────────────────────────────────────────────────────────

def test_config_loads_from_env(valid_env):
    cfg = HederaConfig.from_env()
    assert cfg.network == "testnet"
    assert cfg.operator_id == "0.0.100"


def test_config_treasury_defaults_to_operator(valid_env):
    cfg = HederaConfig.from_env()
    assert cfg.treasury_id  == cfg.operator_id
    assert cfg.treasury_key == cfg.operator_key


def test_config_treasury_overridden_when_set(valid_env, monkeypatch):
    monkeypatch.setenv("HEDERA_TREASURY_ID",  "0.0.200")
    monkeypatch.setenv("HEDERA_TREASURY_KEY", "302f...")
    cfg = HederaConfig.from_env()
    assert cfg.treasury_id  == "0.0.200"
    assert cfg.treasury_key == "302f..."


def test_config_raises_on_missing_operator_id(monkeypatch):
    monkeypatch.setenv("HEDERA_NETWORK",      "testnet")
    monkeypatch.setenv("HEDERA_OPERATOR_KEY", "302e...")
    monkeypatch.delenv("HEDERA_OPERATOR_ID", raising=False)
    with pytest.raises(EnvironmentError, match="HEDERA_OPERATOR_ID"):
        HederaConfig.from_env()


def test_config_raises_on_missing_operator_key(monkeypatch):
    monkeypatch.setenv("HEDERA_NETWORK",     "testnet")
    monkeypatch.setenv("HEDERA_OPERATOR_ID", "0.0.100")
    monkeypatch.delenv("HEDERA_OPERATOR_KEY", raising=False)
    with pytest.raises(EnvironmentError, match="HEDERA_OPERATOR_KEY"):
        HederaConfig.from_env()


def test_config_uses_testnet_by_default(monkeypatch):
    monkeypatch.setenv("HEDERA_OPERATOR_ID",  "0.0.100")
    monkeypatch.setenv("HEDERA_OPERATOR_KEY", "302e...")
    monkeypatch.delenv("HEDERA_NETWORK", raising=False)
    cfg = HederaConfig.from_env()
    assert cfg.network == "testnet"


# ── Backend selection ─────────────────────────────────────────────────────────

def test_unknown_backend_raises(valid_env, monkeypatch):
    monkeypatch.setenv("TRANSFER_BACKEND", "nonexistent")
    with pytest.raises(EnvironmentError, match="nonexistent"):
        execute_hbar_transfer(make_action())


def test_sdk_backend_instantiates():
    assert isinstance(HederaSdkBackend(), HederaSdkBackend)


def test_cli_backend_instantiates():
    assert isinstance(HieroCLIBackend(), HieroCLIBackend)


# ── TransferError ─────────────────────────────────────────────────────────────

def test_transfer_error_carries_action():
    action = make_action()
    err = TransferError("test failure", action, recoverable=False)
    assert err.action is action


def test_transfer_error_recoverable_flag():
    action = make_action()
    transient = TransferError("timeout", action, recoverable=True)
    permanent = TransferError("bad key",  action, recoverable=False)
    assert transient.recoverable is True
    assert permanent.recoverable is False


def test_transfer_error_message():
    action = make_action()
    err = TransferError("something went wrong", action)
    assert "something went wrong" in str(err)


# ── SDK backend: import-failure path ─────────────────────────────────────────

def test_sdk_backend_raises_transfer_error_when_sdk_missing(monkeypatch):
    """If hedera-sdk-py is not installed, the error is typed, not a raw ImportError."""
    import builtins
    real_import = builtins.__import__

    def mock_import(name, *args, **kwargs):
        if name == "hedera":
            raise ImportError("No module named 'hedera'")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", mock_import)

    backend = HederaSdkBackend()
    config  = HederaConfig(
        network="testnet",
        operator_id="0.0.100",
        operator_key="302e...",
        treasury_id="0.0.100",
        treasury_key="302e...",
    )
    action = make_action()
    with pytest.raises(TransferError, match="hedera-sdk-py is not installed"):
        backend.transfer(action, config)


# ── CLI backend: binary-not-found path ───────────────────────────────────────

def test_cli_backend_raises_transfer_error_when_binary_missing(monkeypatch):
    monkeypatch.setenv("HIERO_CLI_PATH", "/nonexistent/hiero")
    backend = HieroCLIBackend()
    config  = HederaConfig(
        network="testnet",
        operator_id="0.0.100",
        operator_key="302e...",
        treasury_id="0.0.100",
        treasury_key="302e...",
    )
    with pytest.raises(TransferError, match="not found"):
        backend.transfer(make_action(), config)
