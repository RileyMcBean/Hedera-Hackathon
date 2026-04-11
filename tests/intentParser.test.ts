import { describe, it, expect, beforeEach } from "vitest";
import { parseInstruction } from "../src/agents/intentParser";

// No LLM keys — all tests use heuristic path
beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

// ── ParseResult shape ─────────────────────────────────────────────────────────

describe("ParseResult shape", () => {
  it("returns parserMode, confidence, parseErrors, workflowContext, action", async () => {
    const r = await parseInstruction("Send 5 HBAR to 0.0.8570146", "0.0.8570111");
    expect(r.parserMode).toBeDefined();
    expect(typeof r.confidence).toBe("number");
    expect(Array.isArray(r.parseErrors)).toBe(true);
    expect(r.workflowContext).toBeDefined();
    expect(r.action).toBeDefined();
  });

  it("returns shouldProceed, parseWarnings, clarificationMessage", async () => {
    const r = await parseInstruction("Send 5 HBAR to 0.0.8570146", "0.0.8570111");
    expect(typeof r.shouldProceed).toBe("boolean");
    expect(Array.isArray(r.parseWarnings)).toBe(true);
    expect(r.clarificationMessage === null || typeof r.clarificationMessage === "string").toBe(true);
  });

  it("always returns heuristic mode when no API key is set", async () => {
    const r = await parseInstruction("Send 5 HBAR to 0.0.800", "0.0.100");
    expect(r.parserMode).toBe("heuristic");
  });
});

// ── HBAR_TRANSFER intent ──────────────────────────────────────────────────────

describe("HBAR_TRANSFER intent", () => {
  it("detects 'send' keyword", async () => {
    const r = await parseInstruction("Send 5 HBAR to 0.0.8570146", "0.0.8570111");
    expect(r.action.actionType).toBe("HBAR_TRANSFER");
    expect(r.workflowContext.detectedIntent).toBe("HBAR_TRANSFER");
  });

  it("detects 'transfer' keyword", async () => {
    const r = await parseInstruction("Transfer 10 HBAR to 0.0.8570146", "0.0.8570111");
    expect(r.action.actionType).toBe("HBAR_TRANSFER");
  });

  it("detects 'pay' keyword", async () => {
    const r = await parseInstruction("Pay 200 HBAR to 0.0.8570146", "0.0.8570111");
    expect(r.action.actionType).toBe("HBAR_TRANSFER");
  });

  it("extracts correct HBAR amount", async () => {
    const r = await parseInstruction("Send 12.5 HBAR to 0.0.8570146", "0.0.8570111");
    expect(r.action.amountHbar).toBe(12.5);
    expect(r.workflowContext.extractedAmount).toBe(12.5);
  });

  it("extracts recipient account (not actor)", async () => {
    const r = await parseInstruction("Send 5 HBAR to 0.0.8570146", "0.0.8570111");
    expect(r.action.recipientId).toBe("0.0.8570146");
    expect(r.workflowContext.extractedRecipient).toBe("0.0.8570146");
  });

  it("skips actor ID when finding recipient", async () => {
    const r = await parseInstruction(
      "0.0.8570111 wants to send 5 HBAR to 0.0.8570146",
      "0.0.8570111"
    );
    expect(r.action.recipientId).toBe("0.0.8570146");
  });

  it("produces high confidence when both amount and recipient present", async () => {
    const r = await parseInstruction("Send 5 HBAR to 0.0.8570146", "0.0.8570111");
    expect(r.confidence).toBe(1.0);
    expect(r.parseErrors).toHaveLength(0);
  });

  it("produces medium confidence when only amount present", async () => {
    const r = await parseInstruction("Send 5 HBAR to someone", "0.0.8570111");
    expect(r.confidence).toBeLessThan(0.8);
    expect(r.parseErrors.some((e) => e.includes("recipient"))).toBe(true);
  });

  it("produces medium confidence when only recipient present", async () => {
    const r = await parseInstruction("send something to 0.0.8570146", "0.0.8570111");
    expect(r.confidence).toBeLessThan(0.8);
    expect(r.parseErrors.some((e) => e.includes("amount"))).toBe(true);
  });

  it("produces low confidence when neither amount nor recipient found", async () => {
    const r = await parseInstruction("please do the thing", "0.0.8570111");
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.parseErrors.length).toBeGreaterThan(0);
  });

  it("preserves rawInstruction", async () => {
    const raw = "Send 5 HBAR to 0.0.8570146";
    const r = await parseInstruction(raw, "0.0.8570111");
    expect(r.action.rawInstruction).toBe(raw);
    expect(r.workflowContext.rawInstruction).toBe(raw);
  });

  it("generates a correlationId", async () => {
    const r = await parseInstruction("Send 5 HBAR to 0.0.8570146", "0.0.8570111");
    expect(r.action.correlationId).toBeTruthy();
  });
});

// ── CHECK_BALANCE intent ──────────────────────────────────────────────────────

describe("CHECK_BALANCE intent", () => {
  it("detects 'check balance'", async () => {
    const r = await parseInstruction("Check my balance", "0.0.8570111");
    expect(r.action.actionType).toBe("CHECK_BALANCE");
    expect(r.workflowContext.detectedIntent).toBe("CHECK_BALANCE");
  });

  it("detects 'how much HBAR do I have'", async () => {
    const r = await parseInstruction("How much HBAR do I have?", "0.0.8570111");
    expect(r.action.actionType).toBe("CHECK_BALANCE");
  });

  it("detects 'what is my balance'", async () => {
    const r = await parseInstruction("What is my balance?", "0.0.8570111");
    expect(r.action.actionType).toBe("CHECK_BALANCE");
  });

  it("defaults amountHbar to 0 for balance check", async () => {
    const r = await parseInstruction("Check my balance", "0.0.8570111");
    expect(r.action.amountHbar).toBe(0);
  });

  it("defaults recipientId to empty string for balance check", async () => {
    const r = await parseInstruction("Check my balance", "0.0.8570111");
    expect(r.action.recipientId).toBe("");
  });

  it("produces confidence ≥ 0.75 for balance intent", async () => {
    const r = await parseInstruction("Check my balance", "0.0.8570111");
    expect(r.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("produces no parse errors for a clean balance check", async () => {
    const r = await parseInstruction("Check my balance", "0.0.8570111");
    expect(r.parseErrors).toHaveLength(0);
  });
});

// ── workflowContext ───────────────────────────────────────────────────────────

describe("workflowContext", () => {
  it("lists all extracted account IDs", async () => {
    const r = await parseInstruction(
      "Send 5 HBAR from 0.0.8570111 to 0.0.8570146",
      "0.0.8570111"
    );
    expect(r.workflowContext.extractedAccounts).toContain("0.0.8570111");
    expect(r.workflowContext.extractedAccounts).toContain("0.0.8570146");
  });

  it("extractedAmount is null when no amount found", async () => {
    const r = await parseInstruction("send to 0.0.8570146", "0.0.8570111");
    expect(r.workflowContext.extractedAmount).toBeNull();
  });

  it("extractedRecipient is null when none found", async () => {
    const r = await parseInstruction("Send 5 HBAR to someone", "0.0.8570111");
    expect(r.workflowContext.extractedRecipient).toBeNull();
  });
});

// ── shouldProceed / ambiguity handling ────────────────────────────────────────

describe("shouldProceed and ambiguity handling", () => {
  // High confidence — proceed
  it("shouldProceed is true when both amount and recipient are present", async () => {
    const r = await parseInstruction("Send 5 HBAR to 0.0.8570146", "0.0.8570111");
    expect(r.shouldProceed).toBe(true);
    expect(r.clarificationMessage).toBeNull();
  });

  it("parseWarnings is empty for a high-confidence parse", async () => {
    const r = await parseInstruction("Send 5 HBAR to 0.0.8570146", "0.0.8570111");
    expect(r.parseWarnings).toHaveLength(0);
  });

  // Medium confidence — proceed with warnings
  it("shouldProceed is true but parseWarnings non-empty when only amount is present", async () => {
    const r = await parseInstruction("Send 5 HBAR to someone", "0.0.8570111");
    // confidence = 0.75 (base 0.5 + amount 0.25) — medium, still proceeds
    expect(r.shouldProceed).toBe(true);
    expect(r.parseWarnings.length).toBeGreaterThan(0);
    expect(r.clarificationMessage).toBeNull();
  });

  // Low confidence — block
  it("shouldProceed is false when neither amount nor recipient are present", async () => {
    const r = await parseInstruction("please do the thing", "0.0.8570111");
    expect(r.shouldProceed).toBe(false);
    expect(r.clarificationMessage).not.toBeNull();
  });

  it("clarificationMessage is set when both amount and recipient are missing", async () => {
    const r = await parseInstruction("please do the thing", "0.0.8570111");
    expect(r.clarificationMessage).toMatch(/missing/i);
  });

  it("shouldProceed is false for vague transfer instructions", async () => {
    const r = await parseInstruction("send money", "0.0.8570111");
    expect(r.shouldProceed).toBe(false);
    expect(r.clarificationMessage).toMatch(/vague|specify|amount|recipient/i);
  });

  it("shouldProceed is false for 'pay them'", async () => {
    const r = await parseInstruction("pay them", "0.0.8570111");
    expect(r.shouldProceed).toBe(false);
    expect(r.clarificationMessage).not.toBeNull();
  });

  // CHECK_BALANCE — not blocked by missing transfer fields
  it("shouldProceed is true for a clean balance check", async () => {
    const r = await parseInstruction("Check my balance", "0.0.8570111");
    expect(r.shouldProceed).toBe(true);
    expect(r.clarificationMessage).toBeNull();
  });

  it("clarificationMessage is null for CHECK_BALANCE", async () => {
    const r = await parseInstruction("What is my balance?", "0.0.8570111");
    expect(r.clarificationMessage).toBeNull();
  });

  // Missing recipient only — proceed with warning (confidence = 0.75)
  it("missing recipient only attaches warning but still proceeds", async () => {
    const r = await parseInstruction("Send 5 HBAR to someone", "0.0.8570111");
    expect(r.shouldProceed).toBe(true);
    expect(r.parseWarnings.some((w) => /recipient/i.test(w))).toBe(true);
  });
});
