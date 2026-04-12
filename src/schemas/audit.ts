/**
 * AuditMessage — the payload written to HCS for every decision.
 *
 * Both approved and denied actions produce an AuditMessage. The full context
 * is embedded so that any party can replay and verify the decision independently.
 */

import { z } from "zod";
import { ActionSchema } from "./action";
import { PolicyResultSchema } from "./policy";

/**
 * Parse-agent context captured at instruction time.
 * Embedded in every audit event so replayers can see what the agent believed.
 */
export const AgentContextSchema = z.object({
  parserMode: z.enum(["heuristic", "llm"]),
  confidence: z.number(),
  parseWarnings: z.array(z.string()).default([]),
  rawInstruction: z.string(),
});

export type AgentContext = z.infer<typeof AgentContextSchema>;

export const AuditMessageSchema = z.object({
  correlationId: z.string(),              // matches Action.correlationId
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
  action: ActionSchema,
  policyResult: PolicyResultSchema,
  txId: z.string().default(""),           // Hedera transaction ID (populated on APPROVED path)
  scheduleId: z.string().default(""),    // Hedera Schedule ID (populated on APPROVAL_REQUIRED path)
  topicId: z.string().default(""),        // HCS topic ID (populated after submission)
  sequenceNumber: z.number().int().default(-1), // HCS sequence number (populated after submission)
  /** Intent Parser Agent context — present when the action originated from a parsed instruction. */
  agentContext: AgentContextSchema.optional(),
});

export type AuditMessage = z.infer<typeof AuditMessageSchema>;
