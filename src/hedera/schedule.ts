/**
 * Hedera Scheduled Transaction — creates a pending transfer that requires
 * a secondary signature before it executes.
 *
 * Used for APPROVAL_REQUIRED outcomes: the transfer is registered on-network
 * but funds are not released until a second signer approves.
 *
 * Backend selection via TRANSFER_BACKEND env:
 *   sdk      → real ScheduleCreateTransaction (default)
 *   dry_run  → returns a deterministic stub schedule ID
 */

import type { Action } from "../schemas/action";
import { hederaConfigFromEnv } from "./config";

export interface ScheduleResult {
  readonly scheduleId: string;
  readonly senderId: string;
  readonly recipientId: string;
  readonly amountHbar: number;
  readonly network: string;
  readonly status: "PENDING_APPROVAL";
}

// ── SDK backend ──────────────────────────────────────────────────────────────

async function createScheduleSdk(action: Action): Promise<ScheduleResult> {
  const sdk = await import("@hashgraph/sdk");
  const {
    Client,
    AccountId,
    PrivateKey,
    TransferTransaction,
    Hbar,
    ScheduleCreateTransaction,
  } = sdk;

  const cfg = hederaConfigFromEnv();

  const operatorId = AccountId.fromString(cfg.operatorId);
  const operatorKey = PrivateKey.fromStringECDSA(
    cfg.operatorKey.replace(/^0x/i, "")
  );
  const treasuryId = AccountId.fromString(cfg.treasuryId);
  const recipientId = AccountId.fromString(action.recipientId);

  const client =
    cfg.network === "testnet" ? Client.forTestnet() : Client.forMainnet();
  client.setOperator(operatorId, operatorKey);

  try {
    const tinybars = Math.round(action.amountHbar * 100_000_000);

    // Build the inner transfer that will execute once the schedule is approved
    const innerTx = new TransferTransaction()
      .addHbarTransfer(treasuryId, Hbar.fromTinybars(-tinybars))
      .addHbarTransfer(recipientId, Hbar.fromTinybars(tinybars));

    // Wrap it in a ScheduleCreateTransaction — the operator pays the fee,
    // but the treasury key signature is NOT provided here, so the transfer
    // stays pending until a second signer submits a ScheduleSignTransaction.
    const scheduleTx = new ScheduleCreateTransaction()
      .setScheduledTransaction(innerTx)
      .setScheduleMemo(
        `Sika Sentinel: ${action.amountHbar} HBAR → ${action.recipientId} [${action.correlationId}]`
      )
      .freezeWith(client);

    const response = await scheduleTx.execute(client);
    const receipt = await response.getReceipt(client);

    const scheduleId = receipt.scheduleId?.toString() ?? "";
    if (!scheduleId) {
      throw new Error("ScheduleCreateTransaction succeeded but returned no scheduleId");
    }

    return {
      scheduleId,
      senderId: cfg.treasuryId,
      recipientId: action.recipientId,
      amountHbar: action.amountHbar,
      network: cfg.network,
      status: "PENDING_APPROVAL",
    };
  } finally {
    client.close();
  }
}

// ── Dry-run backend ──────────────────────────────────────────────────────────

function createScheduleDryRun(action: Action): ScheduleResult {
  return {
    scheduleId: `DRY-SCHED-${action.correlationId}`,
    senderId: "0.0.DRY",
    recipientId: action.recipientId,
    amountHbar: action.amountHbar,
    network: "dry_run",
    status: "PENDING_APPROVAL",
  };
}

// ── Approval result ──────────────────────────────────────────────────────────

export interface ApprovalResult {
  readonly scheduleId: string;
  readonly signTxId: string;
  readonly executionTxId: string; // ID of the actual transfer execution (separate transaction)
  readonly status: "SCHEDULE_APPROVED" | "ALREADY_EXECUTED" | "APPROVAL_SUBMITTED";
  readonly network: string;
}

// ── Approve (SDK) ────────────────────────────────────────────────────────────

async function approveScheduleSdk(scheduleId: string): Promise<ApprovalResult> {
  const sdk = await import("@hashgraph/sdk");
  const {
    Client,
    AccountId,
    PrivateKey,
    ScheduleSignTransaction,
    ScheduleId,
  } = sdk;

  const cfg = hederaConfigFromEnv();

  // The secondary approver can be a separate key pair (HEDERA_APPROVER_*),
  // or fall back to the treasury key — which is the key that needs to sign
  // the inner TransferTransaction for it to execute.
  const approverId = AccountId.fromString(
    process.env.HEDERA_APPROVER_ID || cfg.treasuryId
  );
  const approverKey = PrivateKey.fromStringECDSA(
    (process.env.HEDERA_APPROVER_KEY || cfg.treasuryKey).replace(/^0x/i, "")
  );

  // Operator pays the ScheduleSign fee
  const operatorId = AccountId.fromString(cfg.operatorId);
  const operatorKey = PrivateKey.fromStringECDSA(
    cfg.operatorKey.replace(/^0x/i, "")
  );

  const client =
    cfg.network === "testnet" ? Client.forTestnet() : Client.forMainnet();
  client.setOperator(operatorId, operatorKey);

  try {
    const signTx = new ScheduleSignTransaction()
      .setScheduleId(ScheduleId.fromString(scheduleId))
      .freezeWith(client);

    // Sign with the approver key (treasury key by default — this is the
    // missing signature that the inner TransferTransaction needs)
    const signedTx = await signTx.sign(approverKey);
    const response = await signedTx.execute(client);
    const receipt = await response.getReceipt(client);

    const status = receipt.status.toString();
    const signTxId = response.transactionId.toString();
    // scheduledTransactionId is the ID of the actual transfer that Hedera
    // triggered automatically once all required signatures were collected.
    // This is a SEPARATE transaction from the ScheduleSign itself.
    const executionTxId = receipt.scheduledTransactionId?.toString() ?? "";

    return {
      scheduleId,
      signTxId,
      executionTxId,
      status: status === "SUCCESS" ? "SCHEDULE_APPROVED" : "APPROVAL_SUBMITTED",
      network: cfg.network,
    };
  } finally {
    client.close();
  }
}

// ── Approve (dry run) ────────────────────────────────────────────────────────

function approveScheduleDryRun(scheduleId: string): ApprovalResult {
  return {
    scheduleId,
    signTxId: `DRY-SIGN-${scheduleId}@0.000000000`,
    executionTxId: `DRY-EXEC-${scheduleId}@0.000000000`,
    status: "SCHEDULE_APPROVED",
    network: "dry_run",
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a scheduled HBAR transfer that requires a second signature to execute.
 * Returns the schedule ID for tracking/approval.
 */
export async function createScheduledTransfer(
  action: Action
): Promise<ScheduleResult> {
  const backend = (process.env.TRANSFER_BACKEND ?? "sdk").toLowerCase();
  if (backend === "dry_run") return createScheduleDryRun(action);
  return createScheduleSdk(action);
}

/**
 * Submit a secondary signature to approve a pending scheduled transaction.
 * Uses HEDERA_APPROVER_ID/KEY if set, otherwise falls back to treasury credentials.
 */
export async function approveScheduledTransfer(
  scheduleId: string
): Promise<ApprovalResult> {
  const backend = (process.env.TRANSFER_BACKEND ?? "sdk").toLowerCase();
  if (backend === "dry_run") return approveScheduleDryRun(scheduleId);
  return approveScheduleSdk(scheduleId);
}
