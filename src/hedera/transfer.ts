/**
 * Hedera Execution Adapter — HBAR transfer.
 *
 * Called ONLY for APPROVED actions. Backend selection via TRANSFER_BACKEND env:
 *   sdk      → @hashgraph/sdk  (default, primary)
 *   cli      → Hiero CLI subprocess  (fallback)
 *   dry_run  → No-op stub  (tests / offline demo)
 */

import { execSync } from "child_process";
import type { Action } from "../schemas/action";
import { hederaConfigFromEnv, type HederaConfig } from "./config";

// ── Transfer result ───────────────────────────────────────────────────────────

export interface TransferResult {
  readonly txId: string;
  readonly senderId: string;
  readonly recipientId: string;
  readonly amountHbar: number;
  readonly network: string;
  readonly status: string;
}

// ── Typed exception ───────────────────────────────────────────────────────────

export class TransferError extends Error {
  readonly action: Action;
  readonly recoverable: boolean;

  constructor(message: string, action: Action, opts: { recoverable?: boolean } = {}) {
    super(message);
    this.name = "TransferError";
    this.action = action;
    this.recoverable = opts.recoverable ?? false;
  }
}

// ── Backend interface ─────────────────────────────────────────────────────────

export interface TransferBackend {
  transfer(action: Action, config: HederaConfig): Promise<TransferResult>;
}

// ── Backend: Hedera JS SDK (primary) ─────────────────────────────────────────

export class HederaSdkBackend implements TransferBackend {
  async transfer(action: Action, config: HederaConfig): Promise<TransferResult> {
    let sdk: typeof import("@hashgraph/sdk");
    try {
      sdk = await import("@hashgraph/sdk");
    } catch {
      throw new TransferError(
        "@hashgraph/sdk is not installed. Run: npm install @hashgraph/sdk",
        action,
        { recoverable: false }
      );
    }

    const { Client, AccountId, PrivateKey, TransferTransaction, Hbar } = sdk;

    let operatorId: InstanceType<typeof AccountId>;
    let operatorKey: InstanceType<typeof PrivateKey>;
    let treasuryId: InstanceType<typeof AccountId>;
    let treasuryKey: InstanceType<typeof PrivateKey>;
    let recipientId: InstanceType<typeof AccountId>;

    try {
      operatorId = AccountId.fromString(config.operatorId);
      operatorKey = PrivateKey.fromStringECDSA(config.operatorKey.replace(/^0x/i, ''));
      treasuryId = AccountId.fromString(config.treasuryId);
      treasuryKey = PrivateKey.fromStringECDSA(config.treasuryKey.replace(/^0x/i, ''));
      recipientId = AccountId.fromString(action.recipientId);
    } catch (err) {
      throw new TransferError(
        `Invalid account ID or key format: ${err}`,
        action,
        { recoverable: false }
      );
    }

    try {
      const client =
        config.network === "testnet" ? Client.forTestnet() : Client.forMainnet();
      client.setOperator(operatorId, operatorKey);

      // 1 HBAR = 100_000_000 tinybars
      const tinybars = Math.round(action.amountHbar * 100_000_000);

      const txResponse = await new TransferTransaction()
        .addHbarTransfer(treasuryId, Hbar.fromTinybars(-tinybars))
        .addHbarTransfer(recipientId, Hbar.fromTinybars(tinybars))
        .freezeWith(client)
        .sign(treasuryKey)
        .then((tx) => tx.execute(client));

      const receipt = await txResponse.getReceipt(client);
      const status = receipt.status.toString();

      if (status !== "SUCCESS") {
        throw new TransferError(
          `Transfer rejected by network with status: ${status}`,
          action,
          { recoverable: false }
        );
      }

      const txId = txResponse.transactionId.toString();
      return {
        txId,
        senderId: config.treasuryId,
        recipientId: action.recipientId,
        amountHbar: action.amountHbar,
        network: config.network,
        status: "SUCCESS",
      };
    } catch (err) {
      if (err instanceof TransferError) throw err;
      throw new TransferError(`SDK transfer failed: ${err}`, action, {
        recoverable: true,
      });
    }
  }
}

// ── Backend: Hiero CLI (fallback) ─────────────────────────────────────────────

export class HieroCLIBackend implements TransferBackend {
  private readonly cliBinary = process.env.HIERO_CLI_PATH ?? "hiero";

  async transfer(action: Action, config: HederaConfig): Promise<TransferResult> {
    const cmd = [
      this.cliBinary, "transfer",
      "--network", config.network,
      "--operator-id", config.operatorId,
      "--operator-key", config.operatorKey,
      "--sender", config.treasuryId,
      "--sender-key", config.treasuryKey,
      "--recipient", action.recipientId,
      "--amount", String(action.amountHbar),
      "--unit", "hbar",
      "--output", "json",
    ].join(" ");

    let stdout: string;
    try {
      stdout = execSync(cmd, { timeout: 30_000 }).toString();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ENOENT") || msg.includes("not found")) {
        throw new TransferError(
          `Hiero CLI binary not found at '${this.cliBinary}'. Install it or set HIERO_CLI_PATH.`,
          action,
          { recoverable: false }
        );
      }
      throw new TransferError(`Hiero CLI failed: ${msg}`, action, {
        recoverable: false,
      });
    }

    let txId: string;
    try {
      const data = JSON.parse(stdout);
      txId = data.transactionId;
    } catch (err) {
      throw new TransferError(
        `Could not parse Hiero CLI output: ${err}\nRaw: ${stdout.slice(0, 200)}`,
        action,
        { recoverable: false }
      );
    }

    return {
      txId,
      senderId: config.treasuryId,
      recipientId: action.recipientId,
      amountHbar: action.amountHbar,
      network: config.network,
      status: "SUCCESS",
    };
  }
}

// ── Backend: dry-run (tests / offline demo) ───────────────────────────────────

export class DryRunBackend implements TransferBackend {
  async transfer(action: Action, config: HederaConfig): Promise<TransferResult> {
    const txId = `DRY-RUN-${action.correlationId}@0.000000000`;
    return {
      txId,
      senderId: config.treasuryId,
      recipientId: action.recipientId,
      amountHbar: action.amountHbar,
      network: config.network,
      status: "DRY_RUN",
    };
  }
}

// ── Backend registry and selection ────────────────────────────────────────────

const BACKENDS: Record<string, new () => TransferBackend> = {
  sdk: HederaSdkBackend,
  cli: HieroCLIBackend,
  dry_run: DryRunBackend,
};

function getBackend(): TransferBackend {
  const name = (process.env.TRANSFER_BACKEND ?? "sdk").toLowerCase();
  const Cls = BACKENDS[name];
  if (!Cls) {
    throw new Error(
      `Unknown TRANSFER_BACKEND '${name}'. Valid options: ${Object.keys(BACKENDS).join(", ")}`
    );
  }
  return new Cls();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Execute an approved HBAR transfer using the configured backend.
 */
export async function executeHbarTransfer(action: Action): Promise<TransferResult> {
  const backend = getBackend();
  const config = hederaConfigFromEnv();
  return backend.transfer(action, config);
}
