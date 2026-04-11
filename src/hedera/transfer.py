"""
Hedera Execution Adapter — HBAR transfer.

Called ONLY for APPROVED actions. Never called directly from outside the
sentinel pipeline; the policy engine decision gates every invocation.

Adapter design
--------------
Backend selection is driven by the TRANSFER_BACKEND environment variable
so the execution path can be swapped without code changes:

  TRANSFER_BACKEND=sdk      Hedera Python SDK  (default, primary)
  TRANSFER_BACKEND=cli      Hiero CLI          (fallback, subprocess)
  TRANSFER_BACKEND=dry_run  No-op stub         (tests / offline demo)

All backends share the TransferBackend Protocol and return a TransferResult.
TransferError is raised on any unrecoverable failure; the pipeline catches it
and surfaces it as a structured error rather than a raw exception.

Account model
-------------
  Operator account  — pays transaction fees (HEDERA_OPERATOR_ID / KEY)
  Treasury account  — payout source, debited for transfer amounts
                      (HEDERA_TREASURY_ID / KEY; defaults to operator for demo)
  Recipient account — credited (from Action.recipient_id)
"""

from __future__ import annotations

import logging
import os
import subprocess
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from src.schemas.action import Action

logger = logging.getLogger(__name__)


# ── Transfer result ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class TransferResult:
    """Structured outcome of a completed HBAR transfer."""

    tx_id: str          # Hedera transaction ID, e.g. "0.0.100@1713801600.000000000"
    sender_id: str      # Treasury account that was debited
    recipient_id: str   # Account that was credited
    amount_hbar: float  # Amount transferred
    network: str        # "testnet" | "mainnet"
    status: str         # "SUCCESS" or the Hedera status code string on failure


# ── Typed exception ───────────────────────────────────────────────────────────

class TransferError(Exception):
    """
    Raised when an HBAR transfer cannot be completed.

    Attributes:
        message:     Human-readable reason.
        action:      The Action that triggered the transfer attempt.
        recoverable: True if retrying may succeed (e.g. transient network);
                     False if the error is permanent (bad credentials, etc.).
    """

    def __init__(self, message: str, action: Action, *, recoverable: bool = False) -> None:
        super().__init__(message)
        self.action = action
        self.recoverable = recoverable


# ── Hedera config ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class HederaConfig:
    """Validated Hedera credentials and network settings loaded from env."""

    network: str          # "testnet" | "mainnet"
    operator_id: str      # Hedera account ID paying fees
    operator_key: str     # DER-encoded ED25519 private key for operator
    treasury_id: str      # Payout source account ID
    treasury_key: str     # DER-encoded ED25519 private key for treasury

    @classmethod
    def from_env(cls) -> "HederaConfig":
        """
        Load and validate Hedera config from environment variables.

        Raises:
            EnvironmentError: If any required variable is missing or blank.
        """
        required = {
            "HEDERA_NETWORK":      os.environ.get("HEDERA_NETWORK", "testnet"),
            "HEDERA_OPERATOR_ID":  os.environ.get("HEDERA_OPERATOR_ID", ""),
            "HEDERA_OPERATOR_KEY": os.environ.get("HEDERA_OPERATOR_KEY", ""),
        }
        missing = [k for k, v in required.items() if not v]
        if missing:
            raise EnvironmentError(
                f"Missing required Hedera environment variables: {missing}. "
                f"Copy .env.example to .env and fill in the values."
            )

        # Treasury defaults to operator when not separately configured —
        # acceptable for demo; production deployments should use a dedicated account.
        treasury_id  = os.environ.get("HEDERA_TREASURY_ID")  or required["HEDERA_OPERATOR_ID"]
        treasury_key = os.environ.get("HEDERA_TREASURY_KEY") or required["HEDERA_OPERATOR_KEY"]

        return cls(
            network=required["HEDERA_NETWORK"],
            operator_id=required["HEDERA_OPERATOR_ID"],
            operator_key=required["HEDERA_OPERATOR_KEY"],
            treasury_id=treasury_id,
            treasury_key=treasury_key,
        )


# ── Backend Protocol ──────────────────────────────────────────────────────────

@runtime_checkable
class TransferBackend(Protocol):
    """
    Interface every transfer backend must satisfy.

    Implementors should raise TransferError on failure — never return a
    partial or unconfirmed result.
    """

    def transfer(self, action: Action, config: HederaConfig) -> TransferResult:
        """Execute a transfer and return a confirmed TransferResult."""
        ...


# ── Backend: Hedera Python SDK (primary) ──────────────────────────────────────

class HederaSdkBackend:
    """
    Primary backend — executes HBAR transfers via the Hedera Python SDK.

    Requires:  pip install hedera-sdk-py
    Docs:      https://docs.hedera.com/hedera/sdks-and-apis/sdks/python-sdk
    """

    def transfer(self, action: Action, config: HederaConfig) -> TransferResult:
        """
        Build, sign, and submit a TransferTransaction to Hedera.

        Debits config.treasury_id and credits action.recipient_id.
        The operator account pays the transaction fee.

        Raises:
            TransferError: On SDK import failure, bad credentials, network
                           rejection, or non-SUCCESS receipt status.
        """
        try:
            from hedera import (  # type: ignore[import]
                AccountId,
                Client,
                Hbar,
                PrivateKey,
                TransferTransaction,
            )
        except ImportError as exc:
            raise TransferError(
                "hedera-sdk-py is not installed. Run: pip install hedera-sdk-py",
                action,
                recoverable=False,
            ) from exc

        try:
            operator_id  = AccountId.fromString(config.operator_id)
            operator_key = PrivateKey.fromString(config.operator_key)
            treasury_id  = AccountId.fromString(config.treasury_id)
            treasury_key = PrivateKey.fromString(config.treasury_key)
            recipient_id = AccountId.fromString(action.recipient_id)
        except Exception as exc:
            raise TransferError(
                f"Invalid account ID or key format: {exc}",
                action,
                recoverable=False,
            ) from exc

        try:
            client = (
                Client.forTestnet() if config.network == "testnet"
                else Client.forMainnet()
            )
            client.setOperator(operator_id, operator_key)

            # Amount in tinybars (1 HBAR = 100_000_000 tinybars)
            tinybars = int(action.amount_hbar * 100_000_000)

            tx_response = (
                TransferTransaction()
                .addHbarTransfer(treasury_id,  Hbar.fromTinybars(-tinybars))
                .addHbarTransfer(recipient_id, Hbar.fromTinybars( tinybars))
                .freezeWith(client)
                .sign(treasury_key)
                .execute(client)
            )
            receipt = tx_response.getReceipt(client)
            status  = str(receipt.status)

        except TransferError:
            raise
        except Exception as exc:
            raise TransferError(
                f"SDK transfer failed: {exc}",
                action,
                recoverable=True,
            ) from exc

        if status != "SUCCESS":
            raise TransferError(
                f"Transfer rejected by network with status: {status}",
                action,
                recoverable=False,
            )

        tx_id = str(tx_response.transactionId)
        logger.info(
            "HBAR transfer SUCCESS | tx_id=%s sender=%s recipient=%s amount=%.4f",
            tx_id, config.treasury_id, action.recipient_id, action.amount_hbar,
        )

        return TransferResult(
            tx_id=tx_id,
            sender_id=config.treasury_id,
            recipient_id=action.recipient_id,
            amount_hbar=action.amount_hbar,
            network=config.network,
            status="SUCCESS",
        )


# ── Backend: Hiero CLI (fallback) ─────────────────────────────────────────────

class HieroCLIBackend:
    """
    Fallback backend — executes transfers via the Hiero CLI subprocess.

    Requires:  hiero CLI installed and on PATH
    Docs:      https://docs.hedera.com/hedera/open-source-solutions/hiero-sdk

    Use when the Python SDK has compatibility issues during the hackathon.
    """

    _CLI_BINARY = os.environ.get("HIERO_CLI_PATH", "hiero")

    def transfer(self, action: Action, config: HederaConfig) -> TransferResult:
        """
        Invoke the Hiero CLI to execute an HBAR transfer.

        Raises:
            TransferError: If the CLI is not found, exits non-zero, or
                           the output cannot be parsed.
        """
        cmd = [
            self._CLI_BINARY, "transfer",
            "--network",     config.network,
            "--operator-id", config.operator_id,
            "--operator-key",config.operator_key,
            "--sender",      config.treasury_id,
            "--sender-key",  config.treasury_key,
            "--recipient",   action.recipient_id,
            "--amount",      str(action.amount_hbar),
            "--unit",        "hbar",
            "--output",      "json",
        ]

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
        except FileNotFoundError as exc:
            raise TransferError(
                f"Hiero CLI binary not found at '{self._CLI_BINARY}'. "
                f"Install it or set HIERO_CLI_PATH.",
                action,
                recoverable=False,
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise TransferError(
                "Hiero CLI timed out after 30 seconds.",
                action,
                recoverable=True,
            ) from exc

        if proc.returncode != 0:
            raise TransferError(
                f"Hiero CLI exited with code {proc.returncode}: {proc.stderr.strip()}",
                action,
                recoverable=False,
            )

        # Parse the JSON output for the transaction ID.
        import json as _json
        try:
            data  = _json.loads(proc.stdout)
            tx_id = data["transactionId"]
        except (KeyError, _json.JSONDecodeError) as exc:
            raise TransferError(
                f"Could not parse Hiero CLI output: {exc}\nRaw: {proc.stdout[:200]}",
                action,
                recoverable=False,
            ) from exc

        logger.info(
            "HBAR transfer SUCCESS (CLI) | tx_id=%s recipient=%s amount=%.4f",
            tx_id, action.recipient_id, action.amount_hbar,
        )

        return TransferResult(
            tx_id=tx_id,
            sender_id=config.treasury_id,
            recipient_id=action.recipient_id,
            amount_hbar=action.amount_hbar,
            network=config.network,
            status="SUCCESS",
        )


# ── Backend: dry-run (testing / offline demo) ─────────────────────────────────

class DryRunBackend:
    """
    No-op backend for tests and offline demo mode.

    Returns a deterministic fake transaction ID. No network calls are made.
    Select with TRANSFER_BACKEND=dry_run.
    """

    def transfer(self, action: Action, config: HederaConfig) -> TransferResult:
        tx_id = f"DRY-RUN-{action.correlation_id}@0.000000000"
        logger.info("DRY RUN transfer | tx_id=%s (no network call made)", tx_id)
        return TransferResult(
            tx_id=tx_id,
            sender_id=config.treasury_id,
            recipient_id=action.recipient_id,
            amount_hbar=action.amount_hbar,
            network=config.network,
            status="DRY_RUN",
        )


# ── Backend registry and selection ────────────────────────────────────────────

_BACKENDS: dict[str, type[TransferBackend]] = {
    "sdk":     HederaSdkBackend,
    "cli":     HieroCLIBackend,
    "dry_run": DryRunBackend,
}


def _get_backend() -> TransferBackend:
    """
    Instantiate the configured transfer backend.

    Reads TRANSFER_BACKEND from the environment (default: "sdk").
    """
    name = os.environ.get("TRANSFER_BACKEND", "sdk").lower()
    cls  = _BACKENDS.get(name)
    if cls is None:
        raise EnvironmentError(
            f"Unknown TRANSFER_BACKEND '{name}'. "
            f"Valid options: {list(_BACKENDS)}"
        )
    return cls()


# ── Public API ────────────────────────────────────────────────────────────────

def execute_hbar_transfer(action: Action) -> TransferResult:
    """
    Execute an approved HBAR transfer using the configured backend.

    This is the only function the pipeline should call. It handles backend
    selection, config loading, and delegates to the active TransferBackend.

    Args:
        action: The policy-APPROVED Action. action.recipient_id and
                action.amount_hbar must be non-empty / positive.

    Returns:
        A TransferResult with the confirmed transaction ID and metadata.

    Raises:
        TransferError:    If the transfer fails for any reason.
        EnvironmentError: If required env vars are missing or the backend
                          name is unrecognised.
    """
    backend = _get_backend()
    config  = HederaConfig.from_env()

    logger.info(
        "Executing HBAR transfer | backend=%s recipient=%s amount=%.4f correlation_id=%s",
        type(backend).__name__,
        action.recipient_id,
        action.amount_hbar,
        action.correlation_id,
    )

    return backend.transfer(action, config)
