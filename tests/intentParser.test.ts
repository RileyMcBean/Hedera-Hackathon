/**
 * Tests for the intent parser regex fallback path.
 * LLM path is skipped (no API key in test env).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseInstruction } from "../src/agents/intentParser";

// Ensure no LLM API keys set so tests use regex fallback
beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("parseInstruction (regex fallback)", () => {
  it("extracts HBAR amount and recipient", async () => {
    const action = await parseInstruction("Send 5 HBAR to 0.0.800", "0.0.100");
    expect(action.amountHbar).toBe(5);
    expect(action.recipientId).toBe("0.0.800");
    expect(action.actorId).toBe("0.0.100");
    expect(action.actionType).toBe("HBAR_TRANSFER");
  });

  it("extracts decimal HBAR amount", async () => {
    const action = await parseInstruction("Transfer 12.5 HBAR to 0.0.801", "0.0.100");
    expect(action.amountHbar).toBe(12.5);
    expect(action.recipientId).toBe("0.0.801");
  });

  it("is case-insensitive for HBAR", async () => {
    const action = await parseInstruction("pay 10 hbar to 0.0.800", "0.0.100");
    expect(action.amountHbar).toBe(10);
  });

  it("preserves rawInstruction", async () => {
    const raw = "Send 5 HBAR to 0.0.800";
    const action = await parseInstruction(raw, "0.0.100");
    expect(action.rawInstruction).toBe(raw);
  });

  it("generates a correlationId", async () => {
    const action = await parseInstruction("Send 5 HBAR to 0.0.800", "0.0.100");
    expect(action.correlationId).toBeTruthy();
  });

  it("skips actor ID when finding recipient", async () => {
    // actorId 0.0.100 appears in instruction; recipient should be 0.0.800
    const action = await parseInstruction(
      "0.0.100 wants to send 5 HBAR to 0.0.800",
      "0.0.100"
    );
    expect(action.recipientId).toBe("0.0.800");
  });

  it("returns empty recipientId when none found", async () => {
    const action = await parseInstruction("Send 5 HBAR to someone", "0.0.100");
    expect(action.recipientId).toBe("");
  });

  it("returns 0 amountHbar when no HBAR found", async () => {
    const action = await parseInstruction("pay 0.0.800", "0.0.100");
    expect(action.amountHbar).toBe(0);
  });
});
