/**
 * Intent Parser — converts natural-language instructions into structured Actions.
 *
 * Primary path:  LangChain structured output with OpenAI/Anthropic
 * Fallback path: Regex extraction for hackathon resilience
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import type { Action } from "../schemas/action";
import { ActionSchema } from "../schemas/action";

// ── Regex fallback ────────────────────────────────────────────────────────────

// Matches Hedera account IDs like "0.0.800"
const ACCOUNT_RE = /\b(\d+\.\d+\.\d+)\b/g;

// Matches amounts like "5 HBAR", "12.5 hbar", "100HBAR"
const AMOUNT_RE = /(\d+(?:\.\d+)?)\s*hbar/i;

function parseViaRegex(rawInstruction: string, actorId: string): Action {
  // Extract amount
  const amountMatch = rawInstruction.match(AMOUNT_RE);
  const amountHbar = amountMatch ? parseFloat(amountMatch[1]) : 0;

  // Extract all Hedera account IDs; skip the actor's own ID to find recipient
  const accounts = [...rawInstruction.matchAll(ACCOUNT_RE)].map((m) => m[1]);
  const recipientId = accounts.find((a) => a !== actorId) ?? "";

  return ActionSchema.parse({
    correlationId: randomUUID(),
    actionType: "HBAR_TRANSFER",
    actorId,
    recipientId,
    amountHbar,
    rawInstruction,
    memo: "",
  });
}

// ── LangChain / LLM primary path ──────────────────────────────────────────────

const StructuredActionSchema = z.object({
  recipientId: z.string().describe("Hedera account ID of the recipient, e.g. 0.0.800"),
  amountHbar: z.number().describe("Transfer amount in HBAR (positive number)"),
  memo: z.string().optional().describe("Optional memo for the transaction"),
});

async function parseViaLLM(
  rawInstruction: string,
  actorId: string
): Promise<Action> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No LLM API key set");

  // Dynamically import to avoid hard dependency when LLM path is unused
  const { ChatOpenAI } = await import("@langchain/openai");
  const model = new ChatOpenAI({
    model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    temperature: 0,
  });

  const structured = model.withStructuredOutput(StructuredActionSchema);
  const result = await structured.invoke([
    {
      role: "system",
      content:
        "You are a financial instruction parser. Extract structured transfer details from natural-language payout instructions.",
    },
    {
      role: "user",
      content: rawInstruction,
    },
  ]);

  return ActionSchema.parse({
    correlationId: randomUUID(),
    actionType: "HBAR_TRANSFER",
    actorId,
    recipientId: result.recipientId,
    amountHbar: result.amountHbar,
    rawInstruction,
    memo: result.memo ?? "",
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a natural-language instruction into a structured Action.
 *
 * Tries LLM-based extraction first; falls back to regex on error.
 */
export async function parseInstruction(
  rawInstruction: string,
  actorId: string
): Promise<Action> {
  try {
    return await parseViaLLM(rawInstruction, actorId);
  } catch {
    // Fallback to deterministic regex extraction
    return parseViaRegex(rawInstruction, actorId);
  }
}
