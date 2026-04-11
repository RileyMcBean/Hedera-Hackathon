import { describe, it, expect } from "vitest";
import { ActionSchema, makeAction } from "../src/schemas/action";
import { PolicyResultSchema } from "../src/schemas/policy";
import { AuditMessageSchema } from "../src/schemas/audit";

describe("Action schema", () => {
  it("parses a valid action", () => {
    const action = makeAction({
      actionType: "HBAR_TRANSFER",
      actorId: "0.0.100",
      recipientId: "0.0.800",
      amountHbar: 5.0,
      rawInstruction: "Send 5 HBAR to 0.0.800",
    });
    expect(action.actionType).toBe("HBAR_TRANSFER");
    expect(action.amountHbar).toBe(5.0);
    expect(action.correlationId).toBeTruthy();
    expect(action.memo).toBe("");
  });

  it("auto-generates correlationId", () => {
    const a1 = makeAction({ actionType: "HBAR_TRANSFER", actorId: "0.0.100", recipientId: "0.0.800", amountHbar: 5, rawInstruction: "x" });
    const a2 = makeAction({ actionType: "HBAR_TRANSFER", actorId: "0.0.100", recipientId: "0.0.800", amountHbar: 5, rawInstruction: "x" });
    expect(a1.correlationId).not.toBe(a2.correlationId);
  });
});

describe("PolicyResult schema", () => {
  it("parses approved result", () => {
    const r = PolicyResultSchema.parse({ decision: "APPROVED", evaluatedRules: [] });
    expect(r.decision).toBe("APPROVED");
    expect(r.denialReason).toBeNull();
  });

  it("parses denied result with reason", () => {
    const r = PolicyResultSchema.parse({
      decision: "DENIED",
      denialReason: "MISSING_RECIPIENT",
      denialDetail: "No recipient",
      evaluatedRules: ["R001:RECIPIENT_PRESENT"],
    });
    expect(r.decision).toBe("DENIED");
    expect(r.denialReason).toBe("MISSING_RECIPIENT");
  });
});

describe("AuditMessage schema", () => {
  it("parses a complete audit message", () => {
    const action = makeAction({ actionType: "HBAR_TRANSFER", actorId: "0.0.100", recipientId: "0.0.800", amountHbar: 5, rawInstruction: "x" });
    const policyResult = PolicyResultSchema.parse({ decision: "APPROVED", evaluatedRules: [] });
    const msg = AuditMessageSchema.parse({
      correlationId: action.correlationId,
      action,
      policyResult,
    });
    expect(msg.correlationId).toBe(action.correlationId);
    expect(msg.sequenceNumber).toBe(-1);
    expect(msg.txId).toBe("");
  });
});
