import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Action } from "../src/schemas/action";
import {
  runPolicyOnly,
  isApproved,
  decisionLabel,
  type PipelineResult,
} from "../src/runtime/pipeline";
import { reloadStore, setTreasuryPosture } from "../src/context/loader";

beforeEach(() => reloadStore());
afterEach(() => reloadStore());

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

// ── Return type ───────────────────────────────────────────────────────────────

describe("runPolicyOnly return type", () => {
  it("returns a PipelineResult object", () => {
    const result = runPolicyOnly(makeAction());
    expect(result).toBeDefined();
    expect(result.stage).toBeDefined();
    expect(result.action).toBeDefined();
  });

  it("carries the original action", () => {
    const action = makeAction();
    const result = runPolicyOnly(action);
    expect(result.action.correlationId).toBe(action.correlationId);
  });

  it("carries context", () => {
    const result = runPolicyOnly(makeAction());
    expect(result.context).not.toBeNull();
    expect(result.context?.actorId).toBe("0.0.100");
  });

  it("carries policyResult", () => {
    const result = runPolicyOnly(makeAction());
    expect(result.policyResult).not.toBeNull();
  });

  it("has a timestamp", () => {
    const result = runPolicyOnly(makeAction());
    expect(result.timestamp).toBeTruthy();
  });
});

// ── Happy path: APPROVED ──────────────────────────────────────────────────────

describe("happy path: APPROVED", () => {
  it("valid transfer is APPROVED", () => {
    const result = runPolicyOnly(makeAction());
    expect(result.policyResult?.decision).toBe("APPROVED");
    expect(result.stage).toBe("POLICY_EVALUATED");
  });

  it("isApproved() returns true", () => {
    const result = runPolicyOnly(makeAction());
    expect(isApproved(result)).toBe(true);
  });

  it("decisionLabel() returns APPROVED", () => {
    const result = runPolicyOnly(makeAction());
    expect(decisionLabel(result)).toBe("APPROVED");
  });
});

// ── Policy denials ────────────────────────────────────────────────────────────

describe("policy denials", () => {
  it("missing recipient is denied", () => {
    const result = runPolicyOnly(makeAction({ recipientId: "" }));
    expect(result.policyResult?.decision).toBe("DENIED");
    expect(result.policyResult?.denialReason).toBe("MISSING_RECIPIENT");
    expect(result.stage).toBe("POLICY_EVALUATED");
  });

  it("zero amount is denied", () => {
    const result = runPolicyOnly(makeAction({ amountHbar: 0 }));
    expect(result.policyResult?.decision).toBe("DENIED");
    expect(result.policyResult?.denialReason).toBe("INVALID_AMOUNT");
  });

  it("negative amount is denied", () => {
    const result = runPolicyOnly(makeAction({ amountHbar: -10 }));
    expect(result.policyResult?.decision).toBe("DENIED");
    expect(result.policyResult?.denialReason).toBe("INVALID_AMOUNT");
  });

  it("unapproved recipient is denied", () => {
    const result = runPolicyOnly(makeAction({ recipientId: "0.0.999" }));
    expect(result.policyResult?.decision).toBe("DENIED");
    expect(result.policyResult?.denialReason).toBe("RECIPIENT_NOT_APPROVED");
  });

  it("frozen treasury is denied", () => {
    setTreasuryPosture("FROZEN");
    const result = runPolicyOnly(makeAction());
    expect(result.policyResult?.decision).toBe("DENIED");
    expect(result.policyResult?.denialReason).toBe("TREASURY_FROZEN");
  });
});

// ── Non-approved, non-denied outcomes ────────────────────────────────────────

describe("non-approved outcomes", () => {
  it("amount above threshold requires approval", () => {
    const result = runPolicyOnly(makeAction({ amountHbar: 101 }));
    expect(result.policyResult?.decision).toBe("APPROVAL_REQUIRED");
    expect(isApproved(result)).toBe(false);
  });

  it("restricted treasury triggers manual review", () => {
    setTreasuryPosture("RESTRICTED");
    const result = runPolicyOnly(makeAction());
    expect(result.policyResult?.decision).toBe("MANUAL_REVIEW");
    expect(result.stage).toBe("POLICY_EVALUATED");
  });
});

// ── Denial properties ─────────────────────────────────────────────────────────

describe("denial result properties", () => {
  it("isApproved() is false on denial", () => {
    const result = runPolicyOnly(makeAction({ recipientId: "0.0.999" }));
    expect(isApproved(result)).toBe(false);
  });

  it("decisionLabel() is DENIED", () => {
    const result = runPolicyOnly(makeAction({ recipientId: "0.0.999" }));
    expect(decisionLabel(result)).toBe("DENIED");
  });

  it("has non-empty denial detail", () => {
    const result = runPolicyOnly(makeAction({ recipientId: "0.0.999" }));
    expect(result.policyResult?.denialDetail).not.toBe("");
  });
});

// ── Unknown actor (ERROR stage) ───────────────────────────────────────────────

describe("unknown actor", () => {
  it("returns ERROR stage", () => {
    const result = runPolicyOnly(makeAction({ actorId: "0.0.999" }));
    expect(result.stage).toBe("ERROR");
    expect(result.context).toBeNull();
    expect(result.policyResult).toBeNull();
  });

  it("error message contains actor ID", () => {
    const result = runPolicyOnly(makeAction({ actorId: "0.0.999" }));
    expect(result.error).toContain("0.0.999");
  });

  it("isApproved() is false for ERROR", () => {
    const result = runPolicyOnly(makeAction({ actorId: "0.0.999" }));
    expect(isApproved(result)).toBe(false);
  });

  it("decisionLabel() is ERROR", () => {
    const result = runPolicyOnly(makeAction({ actorId: "0.0.999" }));
    expect(decisionLabel(result)).toBe("ERROR");
  });
});

// ── Phase 2 placeholder fields ────────────────────────────────────────────────

describe("phase 2 placeholder fields", () => {
  it("txId, hcsTopicId, hcsSequenceNumber are empty in phase 1", () => {
    const result = runPolicyOnly(makeAction());
    expect(result.txId).toBe("");
    expect(result.hcsTopicId).toBe("");
    expect(result.hcsSequenceNumber).toBe(-1);
  });
});

// ── Correlation ID preserved ──────────────────────────────────────────────────

describe("correlation ID preservation", () => {
  it("is preserved end-to-end", () => {
    const action = makeAction();
    const result = runPolicyOnly(action);
    expect(result.action.correlationId).toBe(action.correlationId);
  });
});
