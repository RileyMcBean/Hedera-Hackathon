/**
 * Action — the canonical internal representation of a payout instruction.
 *
 * Created by the intent parser from natural-language input and passed
 * unchanged through the context engine, policy engine, and audit layer.
 */

import { z } from "zod";
import { randomUUID } from "crypto";

export const ActionTypeSchema = z.enum(["HBAR_TRANSFER"]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActionSchema = z.object({
  correlationId: z.string().uuid().default(() => randomUUID()),
  actionType: ActionTypeSchema,
  actorId: z.string(),       // Hedera account ID of the requesting actor
  recipientId: z.string(),   // Hedera account ID of the intended recipient
  amountHbar: z.number(),    // Amount in HBAR (not tinybars)
  rawInstruction: z.string(), // Original natural-language input (preserved for audit)
  memo: z.string().default(""),
});

export type Action = z.infer<typeof ActionSchema>;

/** Convenience factory that fills in correlationId automatically. */
export function makeAction(params: Omit<Action, "correlationId" | "memo"> & { correlationId?: string; memo?: string }): Action {
  return ActionSchema.parse(params);
}
