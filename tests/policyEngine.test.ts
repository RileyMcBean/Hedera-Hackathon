import { describe, it, expect } from "vitest";
import {
  R001, R002, R003, R004, R005, R006, R007,
  evaluatePolicy,
  evaluate,
} from "../src/policy/engine";
import type { Action } from "../src/schemas/action";
import type { ContextSnapshot } from "../src/context/loader";

function makeAction(overrides: Partial<Action> = {}): Action {
  return {
    correlationId: "test-correlation-id",
    actionType: "HBAR_TRANSFER",
    actorId: "0.0.100",
    recipientId: "0.0.800",
    amountHbar: 5.0,
    rawInstruction: "Send 5 HBAR to 0.0.800",
    memo: "",
    ...overrides,
  };
}

function makeContext(overrides: Partial<ContextSnapshot> = {}): ContextSnapshot {
  return {
    actorId: "0.0.100",
    actorRole: "OPERATOR",
    partnerId: "partner-alpha",
    amountThresholdHbar: 100.0,
    approvedRecipients: ["0.0.800", "0.0.801"],
    treasuryPosture: "NORMAL",
    enforceRecipientAllowlist: true,
    ...overrides,
  };
}

// ── Full approval path ────────────────────────────────────────────────────────

describe("full approval path", () => {
  it("returns APPROVED when all rules pass", () => {
    const result = evaluatePolicy(makeAction(), makeContext());
    expect(result.decision).toBe("APPROVED");
    expect(result.denialReason).toBeNull();
    expect(result.evaluatedRules).toContain(R001);
    expect(result.evaluatedRules).toContain(R007);
  });

  it("has empty denialDetail on approval", () => {
    const result = evaluatePolicy(makeAction(), makeContext());
    expect(result.denialDetail).toBe("");
  });
});

// ── R001: recipient present ───────────────────────────────────────────────────

describe("R001: RECIPIENT_PRESENT", () => {
  it("denies blank recipient", () => {
    const result = evaluatePolicy(makeAction({ recipientId: "" }), makeContext());
    expect(result.decision).toBe("DENIED");
    expect(result.denialReason).toBe("MISSING_RECIPIENT");
    expect(result.evaluatedRules).toEqual([R001]);
  });

  it("denies whitespace-only recipient", () => {
    const result = evaluatePolicy(makeAction({ recipientId: "   " }), makeContext());
    expect(result.decision).toBe("DENIED");
    expect(result.denialReason).toBe("MISSING_RECIPIENT");
  });
});

// ── R002: amount valid ────────────────────────────────────────────────────────

describe("R002: AMOUNT_VALID", () => {
  it("denies zero amount", () => {
    const result = evaluatePolicy(makeAction({ amountHbar: 0 }), makeContext());
    expect(result.decision).toBe("DENIED");
    expect(result.denialReason).toBe("INVALID_AMOUNT");
    expect(result.evaluatedRules).toContain(R002);
  });

  it("denies negative amount", () => {
    const result = evaluatePolicy(makeAction({ amountHbar: -1 }), makeContext());
    expect(result.decision).toBe("DENIED");
    expect(result.denialReason).toBe("INVALID_AMOUNT");
  });

  it("allows small positive amount", () => {
    const result = evaluatePolicy(makeAction({ amountHbar: 0.001 }), makeContext());
    expect(result.decision).toBe("APPROVED");
  });
});

// ── R003: actor authorised ────────────────────────────────────────────────────

describe("R003: ACTOR_AUTHORISED", () => {
  it("PARTNER role is authorised", () => {
    const result = evaluatePolicy(makeAction(), makeContext({ actorRole: "PARTNER" }));
    expect(result.decision).toBe("APPROVED");
  });

  it("ADMIN role is authorised", () => {
    const result = evaluatePolicy(makeAction(), makeContext({ actorRole: "ADMIN", enforceRecipientAllowlist: false }));
    expect(result.decision).toBe("APPROVED");
  });

  it("all named roles are authorised", () => {
    for (const role of ["OPERATOR", "PARTNER", "ADMIN"] as const) {
      const result = evaluatePolicy(
        makeAction(),
        makeContext({ actorRole: role, enforceRecipientAllowlist: role === "ADMIN" ? false : true })
      );
      expect(result.denialReason).not.toBe("ACTOR_NOT_AUTHORISED");
    }
  });
});

// ── R004: treasury not frozen ─────────────────────────────────────────────────

describe("R004: TREASURY_NOT_FROZEN", () => {
  it("denies when treasury is FROZEN", () => {
    const result = evaluatePolicy(makeAction(), makeContext({ treasuryPosture: "FROZEN" }));
    expect(result.decision).toBe("DENIED");
    expect(result.denialReason).toBe("TREASURY_FROZEN");
    expect(result.evaluatedRules).toContain(R004);
  });

  it("blocks even tiny amounts when frozen", () => {
    const result = evaluatePolicy(
      makeAction({ amountHbar: 0.001 }),
      makeContext({ treasuryPosture: "FROZEN" })
    );
    expect(result.decision).toBe("DENIED");
    expect(result.denialReason).toBe("TREASURY_FROZEN");
  });
});

// ── R005: recipient approved ──────────────────────────────────────────────────

describe("R005: RECIPIENT_APPROVED", () => {
  it("denies recipient not on list", () => {
    const result = evaluatePolicy(
      makeAction({ recipientId: "0.0.999" }),
      makeContext({ approvedRecipients: ["0.0.800"] })
    );
    expect(result.decision).toBe("DENIED");
    expect(result.denialReason).toBe("RECIPIENT_NOT_APPROVED");
    expect(result.evaluatedRules).toContain(R005);
  });

  it("skipped when enforcement is disabled", () => {
    const result = evaluatePolicy(
      makeAction({ recipientId: "0.0.999" }),
      makeContext({ approvedRecipients: ["0.0.800"], enforceRecipientAllowlist: false })
    );
    expect(result.decision).toBe("APPROVED");
  });

  it("denies all recipients when list is empty and enforce=true", () => {
    const result = evaluatePolicy(
      makeAction({ recipientId: "0.0.999" }),
      makeContext({ approvedRecipients: [], enforceRecipientAllowlist: true })
    );
    expect(result.decision).toBe("DENIED");
    expect(result.denialReason).toBe("RECIPIENT_NOT_APPROVED");
  });

  it("passes for approved recipient", () => {
    const result = evaluatePolicy(
      makeAction({ recipientId: "0.0.801" }),
      makeContext({ approvedRecipients: ["0.0.800", "0.0.801"] })
    );
    expect(result.decision).toBe("APPROVED");
  });
});

// ── R006: amount within limit ─────────────────────────────────────────────────

describe("R006: AMOUNT_WITHIN_LIMIT", () => {
  it("returns APPROVAL_REQUIRED when amount exceeds threshold", () => {
    const result = evaluatePolicy(
      makeAction({ amountHbar: 150 }),
      makeContext({ amountThresholdHbar: 100 })
    );
    expect(result.decision).toBe("APPROVAL_REQUIRED");
    expect(result.denialReason).toBe("AMOUNT_EXCEEDS_THRESHOLD");
    expect(result.evaluatedRules).toContain(R006);
  });

  it("passes at exact threshold", () => {
    const result = evaluatePolicy(
      makeAction({ amountHbar: 100 }),
      makeContext({ amountThresholdHbar: 100 })
    );
    expect(result.decision).toBe("APPROVED");
  });

  it("passes below threshold", () => {
    const result = evaluatePolicy(
      makeAction({ amountHbar: 99.99 }),
      makeContext({ amountThresholdHbar: 100 })
    );
    expect(result.decision).toBe("APPROVED");
  });
});

// ── R007: treasury not restricted ────────────────────────────────────────────

describe("R007: TREASURY_NOT_RESTRICTED", () => {
  it("returns MANUAL_REVIEW when treasury is RESTRICTED", () => {
    const result = evaluatePolicy(makeAction(), makeContext({ treasuryPosture: "RESTRICTED" }));
    expect(result.decision).toBe("MANUAL_REVIEW");
    expect(result.denialReason).toBe("TREASURY_RESTRICTED");
    expect(result.evaluatedRules).toContain(R007);
  });

  it("R006 fires before R007 (APPROVAL_REQUIRED takes precedence)", () => {
    const result = evaluatePolicy(
      makeAction({ amountHbar: 200 }),
      makeContext({ amountThresholdHbar: 100, treasuryPosture: "RESTRICTED" })
    );
    expect(result.decision).toBe("APPROVAL_REQUIRED");
  });
});

// ── Rule ordering / short-circuit ─────────────────────────────────────────────

describe("rule ordering and short-circuit", () => {
  it("R001 fires before R004 (blank recipient + frozen treasury)", () => {
    const result = evaluatePolicy(
      makeAction({ recipientId: "" }),
      makeContext({ treasuryPosture: "FROZEN" })
    );
    expect(result.denialReason).toBe("MISSING_RECIPIENT");
    expect(result.evaluatedRules).toEqual([R001]);
  });

  it("R004 fires before R005 (frozen + unapproved recipient)", () => {
    const result = evaluatePolicy(
      makeAction({ recipientId: "0.0.999" }),
      makeContext({ treasuryPosture: "FROZEN" })
    );
    expect(result.denialReason).toBe("TREASURY_FROZEN");
  });

  it("R005 fires before R006 (unapproved recipient + amount over threshold)", () => {
    const result = evaluatePolicy(
      makeAction({ recipientId: "0.0.999", amountHbar: 999 }),
      makeContext({ approvedRecipients: ["0.0.800"], amountThresholdHbar: 100 })
    );
    expect(result.denialReason).toBe("RECIPIENT_NOT_APPROVED");
  });
});

// ── evaluate() alias ──────────────────────────────────────────────────────────

describe("evaluate alias", () => {
  it("evaluate() alias works identically", () => {
    const result = evaluate(makeAction(), makeContext());
    expect(result.decision).toBe("APPROVED");
  });
});

// ── PolicyResult content ──────────────────────────────────────────────────────

describe("PolicyResult content", () => {
  it("denial detail is non-empty on denial", () => {
    const result = evaluatePolicy(
      makeAction({ recipientId: "0.0.999" }),
      makeContext({ approvedRecipients: ["0.0.800"] })
    );
    expect(result.denialDetail).not.toBe("");
  });

  it("denial detail contains the recipient ID", () => {
    const result = evaluatePolicy(
      makeAction({ recipientId: "0.0.999" }),
      makeContext({ approvedRecipients: ["0.0.800"] })
    );
    expect(result.denialDetail).toContain("0.0.999");
  });
});
