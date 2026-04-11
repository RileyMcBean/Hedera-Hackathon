/**
 * AuditMessage — the payload written to HCS for every decision.
 *
 * Both approved and denied actions produce an AuditMessage. The full context
 * is embedded so that any party can replay and verify the decision independently.
 */

import { z } from "zod";
import { ActionSchema } from "./action";
import { PolicyResultSchema } from "./policy";

export const AuditMessageSchema = z.object({
  correlationId: z.string(),              // matches Action.correlationId
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
  action: ActionSchema,
  policyResult: PolicyResultSchema,
  txId: z.string().default(""),           // Hedera transaction ID (populated on APPROVED path)
  topicId: z.string().default(""),        // HCS topic ID (populated after submission)
  sequenceNumber: z.number().int().default(-1), // HCS sequence number (populated after submission)
});

export type AuditMessage = z.infer<typeof AuditMessageSchema>;
