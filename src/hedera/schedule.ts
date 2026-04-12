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
