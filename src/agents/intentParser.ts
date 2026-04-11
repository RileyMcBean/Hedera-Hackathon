/**
 * Intent Parser Agent — converts natural-language financial instructions
 * into structured Action objects for the Sika Sentinel runtime pipeline.
 *
 * Strategy
 * --------
 * 1. Heuristic extraction  — deterministic regex patterns, always attempted first.
 *    Fast, predictable, no external dependencies.
 * 2. LLM fallback          — used only when heuristic confidence is below threshold
 *    OR when required env vars (OPENAI_API_KEY etc.) are present and the caller
 *    explicitly wants LLM enrichment.
 *
 * Outputs a ParseResult which wraps the Action with metadata:
 *   parserMode   — "heuristic" | "llm"
 *   confidence   — 0.0–1.0 score based on how much was extracted
 *   parseErrors  — non-fatal warnings (missing amount, no recipient found, etc.)
 *   workflowContext — everything the parser observed, for UI/audit rendering
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import { ActionSchema, type Action, type ActionType } from "../schemas/action";

// ── ParseResult schema ────────────────────────────────────────────────────────

export interface WorkflowContext {
  rawInstruction: string;
  detectedIntent: ActionType;
  extractedAmount: number | null;
  extractedRecipient: string | null;
  extractedAccounts: string[];
}

export interface ParseResult {
  action: Action;
  parserMode: "heuristic" | "llm";
  /** 0.0 – 1.0. ≥0.8 = high confidence, 0.5–0.8 = medium, <0.5 = low */
  confidence: number;
  /** Non-fatal parse warnings. Empty array = clean parse. */
  parseErrors: string[];
  workflowContext: WorkflowContext;
}

// ── Regex patterns ────────────────────────────────────────────────────────────

// Hedera account ID: shard.realm.num
const ACCOUNT_RE = /\b(0\.\d+\.\d+)\b/g;

// Amount: "5 HBAR", "12.5hbar", "100 HBAR"
const AMOUNT_RE = /(\d+(?:\.\d+)?)\s*hbar\b/i;

// Transfer intent keywords
const TRANSFER_RE = /\b(send|transfer|pay|move|dispatch|wire|remit)\b/i;

// Balance intent keywords
const BALANCE_RE = /\b(balance|check\s+balance|how\s+much|query\s+balance|get\s+balance|what.{0,10}balance)\b/i;

// ── Heuristic intent detector ─────────────────────────────────────────────────

function detectIntent(text: string): ActionType {
  if (BALANCE_RE.test(text)) return "CHECK_BALANCE";
  if (TRANSFER_RE.test(text)) return "HBAR_TRANSFER";
  // Fallback: if there's an amount, treat as transfer
  if (AMOUNT_RE.test(text)) return "HBAR_TRANSFER";
  // Default to transfer — most common intent in this domain
  return "HBAR_TRANSFER";
}

// ── Heuristic extractor ───────────────────────────────────────────────────────

function extractHeuristic(
  rawInstruction: string,
  actorId: string
): { result: ParseResult; needsLlm: boolean } {
  const parseErrors: string[] = [];

  const intent = detectIntent(rawInstruction);

  // Extract all account IDs
  const accountMatches = [...rawInstruction.matchAll(ACCOUNT_RE)].map((m) => m[1]);
  const uniqueAccounts = [...new Set(accountMatches)];

  // Recipient = first account that isn't the actor
  const extractedRecipient = uniqueAccounts.find((a) => a !== actorId) ?? null;

  // Amount
  const amountMatch = rawInstruction.match(AMOUNT_RE);
  const extractedAmount = amountMatch ? parseFloat(amountMatch[1]) : null;

  // ── Confidence scoring ──────────────────────────────────────────────────────
  let confidence: number;

  if (intent === "HBAR_TRANSFER") {
    confidence = 0.5; // base
    if (extractedAmount !== null) confidence += 0.25;
    else parseErrors.push("No HBAR amount found in instruction");

    if (extractedRecipient !== null) confidence += 0.25;
    else parseErrors.push("No recipient account ID found in instruction");
  } else {
    // CHECK_BALANCE — simpler, inherently higher confidence
    confidence = 0.75;
    if (extractedRecipient !== null || uniqueAccounts.length > 0) confidence += 0.15;
  }

  // Round to 2 dp
  confidence = Math.round(confidence * 100) / 100;

  // ── Determine whether LLM fallback is warranted ─────────────────────────────
  // Trigger LLM if confidence is below threshold for transfer intent
  const needsLlm = intent === "HBAR_TRANSFER" && confidence < 0.75;

  // ── Build Action ────────────────────────────────────────────────────────────
  const action = ActionSchema.parse({
    correlationId: randomUUID(),
    actionType: intent,
    actorId,
    recipientId: extractedRecipient ?? "",
    amountHbar: extractedAmount ?? 0,
    rawInstruction,
    memo: "",
  });

  return {
    needsLlm,
    result: {
      action,
      parserMode: "heuristic",
      confidence,
      parseErrors,
      workflowContext: {
        rawInstruction,
        detectedIntent: intent,
        extractedAmount,
        extractedRecipient,
        extractedAccounts: uniqueAccounts,
      },
    },
  };
}

// ── LLM extractor ─────────────────────────────────────────────────────────────

const LlmOutputSchema = z.object({
  actionType: z.enum(["HBAR_TRANSFER", "CHECK_BALANCE"]),
  recipientId: z.string().default(""),
  amountHbar: z.number().default(0),
  memo: z.string().optional(),
});

async function extractViaLlm(
  rawInstruction: string,
  actorId: string
): Promise<ParseResult> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No LLM API key configured");

  const { ChatOpenAI } = await import("@langchain/openai");
  const model = new ChatOpenAI({
    model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    temperature: 0,
  });

  const structured = model.withStructuredOutput(LlmOutputSchema);
  const llmResult = await structured.invoke([
    {
      role: "system",
      content: [
        "You are a financial instruction parser for a Hedera blockchain governance system.",
        "Extract structured transfer or balance-check details from natural-language instructions.",
        "Hedera account IDs look like 0.0.12345.",
        "Return actionType=HBAR_TRANSFER for any payment/send/transfer instruction.",
        "Return actionType=CHECK_BALANCE for balance queries.",
      ].join(" "),
    },
    { role: "user", content: rawInstruction },
  ]);

  const parseErrors: string[] = [];
  if (llmResult.actionType === "HBAR_TRANSFER") {
    if (!llmResult.recipientId) parseErrors.push("LLM could not identify a recipient account");
    if (!llmResult.amountHbar) parseErrors.push("LLM could not identify a transfer amount");
  }

  const confidence =
    llmResult.actionType === "CHECK_BALANCE"
      ? 0.9
      : llmResult.recipientId && llmResult.amountHbar
      ? 0.95
      : 0.6;

  const action = ActionSchema.parse({
    correlationId: randomUUID(),
    actionType: llmResult.actionType,
    actorId,
    recipientId: llmResult.recipientId,
    amountHbar: llmResult.amountHbar,
    rawInstruction,
    memo: llmResult.memo ?? "",
  });

  // Mirror what heuristic found for workflowContext
  const accounts = [...rawInstruction.matchAll(ACCOUNT_RE)].map((m) => m[1]);

  return {
    action,
    parserMode: "llm",
    confidence,
    parseErrors,
    workflowContext: {
      rawInstruction,
      detectedIntent: llmResult.actionType,
      extractedAmount: llmResult.amountHbar || null,
      extractedRecipient: llmResult.recipientId || null,
      extractedAccounts: [...new Set(accounts)],
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a natural-language instruction into a structured ParseResult.
 *
 * Always runs heuristic extraction first. Falls back to LLM only when:
 *   - heuristic confidence < 0.75 for a transfer intent, AND
 *   - an LLM API key is available in the environment.
 *
 * Never throws — LLM failures return the heuristic result with a parse error.
 */
export async function parseInstruction(
  rawInstruction: string,
  actorId: string
): Promise<ParseResult> {
  const { result: heuristicResult, needsLlm } = extractHeuristic(
    rawInstruction,
    actorId
  );

  if (!needsLlm) return heuristicResult;

  const hasLlmKey = !!(
    process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY
  );
  if (!hasLlmKey) return heuristicResult;

  try {
    return await extractViaLlm(rawInstruction, actorId);
  } catch (err) {
    // LLM failed — return heuristic result with a warning appended
    return {
      ...heuristicResult,
      parseErrors: [
        ...heuristicResult.parseErrors,
        `LLM fallback failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}
