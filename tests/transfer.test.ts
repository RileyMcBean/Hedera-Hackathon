import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Action } from "../src/schemas/action";
import {
  DryRunBackend,
  HederaSdkBackend,
  HieroCLIBackend,
  TransferError,
  executeHbarTransfer,
  type TransferResult,
} from "../src/hedera/transfer";
import { hederaConfigFromEnv, type HederaConfig } from "../src/hedera/config";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAction(overrides: Partial<Action> = {}): Action {
  return {
    correlationId: "test-corr-id",
    actionType: "HBAR_TRANSFER",
    actorId: "0.0.100",
    recipientId: "0.0.800",
    amountHbar: 5.0,
    rawInstruction: "Send 5 HBAR to 0.0.800",
    memo: "",
    ...overrides,
  };
}

function makeDryRunConfig(): HederaConfig {
  return {
    network: "testnet",
    operatorId: "0.0.100",
    operatorKey: "302e...",
    treasuryId: "0.0.100",
    treasuryKey: "302e...",
  };
}

// Force dry-run backend for all tests
let origBackend: string | undefined;
beforeEach(() => {
  origBackend = process.env.TRANSFER_BACKEND;
  process.env.TRANSFER_BACKEND = "dry_run";
  // Set minimum env for HederaConfig.fromEnv()
  process.env.HEDERA_NETWORK = "testnet";
  process.env.HEDERA_OPERATOR_ID = "0.0.100";
  process.env.HEDERA_OPERATOR_KEY = "302e...";
  delete process.env.HEDERA_TREASURY_ID;
  delete process.env.HEDERA_TREASURY_KEY;
});
afterEach(() => {
  if (origBackend !== undefined) {
    process.env.TRANSFER_BACKEND = origBackend;
  } else {
    delete process.env.TRANSFER_BACKEND;
  }
});

// ── TransferResult shape ──────────────────────────────────────────────────────

describe("TransferResult shape", () => {
  it("returns a TransferResult", async () => {
    const result = await executeHbarTransfer(makeAction());
    expect(result).toBeDefined();
    expect(result.txId).toBeTruthy();
  });

  it("carries recipient", async () => {
    const result = await executeHbarTransfer(makeAction({ recipientId: "0.0.801" }));
    expect(result.recipientId).toBe("0.0.801");
  });

  it("carries amount", async () => {
    const result = await executeHbarTransfer(makeAction({ amountHbar: 12.5 }));
    expect(result.amountHbar).toBe(12.5);
  });

  it("carries network", async () => {
    const result = await executeHbarTransfer(makeAction());
    expect(result.network).toBe("testnet");
  });

  it("tx_id is non-empty", async () => {
    const result = await executeHbarTransfer(makeAction());
    expect(result.txId).not.toBe("");
  });

  it("status is DRY_RUN for dry-run backend", async () => {
    const result = await executeHbarTransfer(makeAction());
    expect(result.status).toBe("DRY_RUN");
  });
});

// ── Dry-run backend ───────────────────────────────────────────────────────────

describe("DryRunBackend", () => {
  it("tx_id contains correlation_id", async () => {
    const action = makeAction();
    const result = await executeHbarTransfer(action);
    expect(result.txId).toContain(action.correlationId);
  });

  it("two calls produce different tx_ids", async () => {
    const r1 = await executeHbarTransfer({ ...makeAction(), correlationId: "id-1" });
    const r2 = await executeHbarTransfer({ ...makeAction(), correlationId: "id-2" });
    expect(r1.txId).not.toBe(r2.txId);
  });

  it("backend used directly", async () => {
    const backend = new DryRunBackend();
    const result = await backend.transfer(makeAction(), makeDryRunConfig());
    expect(result.status).toBe("DRY_RUN");
    expect(result.recipientId).toBe("0.0.800");
  });
});

// ── HederaConfig ──────────────────────────────────────────────────────────────

describe("hederaConfigFromEnv", () => {
  it("loads from env", () => {
    const cfg = hederaConfigFromEnv();
    expect(cfg.network).toBe("testnet");
    expect(cfg.operatorId).toBe("0.0.100");
  });

  it("treasury defaults to operator when not set", () => {
    const cfg = hederaConfigFromEnv();
    expect(cfg.treasuryId).toBe(cfg.operatorId);
    expect(cfg.treasuryKey).toBe(cfg.operatorKey);
  });

  it("treasury overrides when set", () => {
    process.env.HEDERA_TREASURY_ID = "0.0.200";
    process.env.HEDERA_TREASURY_KEY = "302f...";
    const cfg = hederaConfigFromEnv();
    expect(cfg.treasuryId).toBe("0.0.200");
    expect(cfg.treasuryKey).toBe("302f...");
    delete process.env.HEDERA_TREASURY_ID;
    delete process.env.HEDERA_TREASURY_KEY;
  });

  it("throws on missing operator ID", () => {
    delete process.env.HEDERA_OPERATOR_ID;
    expect(() => hederaConfigFromEnv()).toThrow("HEDERA_OPERATOR_ID");
    process.env.HEDERA_OPERATOR_ID = "0.0.100";
  });

  it("throws on missing operator key", () => {
    delete process.env.HEDERA_OPERATOR_KEY;
    expect(() => hederaConfigFromEnv()).toThrow("HEDERA_OPERATOR_KEY");
    process.env.HEDERA_OPERATOR_KEY = "302e...";
  });

  it("uses testnet by default when HEDERA_NETWORK not set", () => {
    delete process.env.HEDERA_NETWORK;
    const cfg = hederaConfigFromEnv();
    expect(cfg.network).toBe("testnet");
    process.env.HEDERA_NETWORK = "testnet";
  });
});

// ── Backend selection ─────────────────────────────────────────────────────────

describe("backend selection", () => {
  it("unknown backend throws", async () => {
    process.env.TRANSFER_BACKEND = "nonexistent";
    await expect(executeHbarTransfer(makeAction())).rejects.toThrow("nonexistent");
    process.env.TRANSFER_BACKEND = "dry_run";
  });

  it("HederaSdkBackend can be instantiated", () => {
    expect(new HederaSdkBackend()).toBeInstanceOf(HederaSdkBackend);
  });

  it("HieroCLIBackend can be instantiated", () => {
    expect(new HieroCLIBackend()).toBeInstanceOf(HieroCLIBackend);
  });
});

// ── TransferError ─────────────────────────────────────────────────────────────

describe("TransferError", () => {
  it("carries action", () => {
    const action = makeAction();
    const err = new TransferError("test failure", action, { recoverable: false });
    expect(err.action).toBe(action);
  });

  it("recoverable flag", () => {
    const action = makeAction();
    const transient = new TransferError("timeout", action, { recoverable: true });
    const permanent = new TransferError("bad key", action, { recoverable: false });
    expect(transient.recoverable).toBe(true);
    expect(permanent.recoverable).toBe(false);
  });

  it("error message is preserved", () => {
    const err = new TransferError("something went wrong", makeAction());
    expect(err.message).toContain("something went wrong");
  });

  it("default recoverable is false", () => {
    const err = new TransferError("oops", makeAction());
    expect(err.recoverable).toBe(false);
  });
});

// ── CLI backend: binary not found ─────────────────────────────────────────────

describe("HieroCLIBackend: binary not found", () => {
  it("throws TransferError when binary is missing", async () => {
    const origPath = process.env.HIERO_CLI_PATH;
    process.env.HIERO_CLI_PATH = "/nonexistent/hiero";
    const backend = new HieroCLIBackend();
    await expect(backend.transfer(makeAction(), makeDryRunConfig())).rejects.toBeInstanceOf(TransferError);
    if (origPath !== undefined) process.env.HIERO_CLI_PATH = origPath;
    else delete process.env.HIERO_CLI_PATH;
  });
});
