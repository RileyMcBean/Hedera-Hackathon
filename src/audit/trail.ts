/**
 * Audit Trail — builds and persists AuditMessages to HCS.
 *
 * record: called for every decision (approved or denied) to write to HCS.
 * replay: fetches ordered message history from Mirror Node for UI display.
 */

import type { Action } from "../schemas/action";
import type { PolicyResult } from "../schemas/policy";
import type { AuditMessage } from "../schemas/audit";
import { submitMessage, fetchMessages } from "../hedera/hcs";

/**
 * Build an AuditMessage and submit it to the HCS audit topic.
 *
 * Called for ALL outcomes — approved, denied, manual review, etc.
 */
export async function record(
  action: Action,
  policyResult: PolicyResult,
  txId = ""
): Promise<AuditMessage> {
  const msg: AuditMessage = {
    correlationId: action.correlationId,
    timestamp: new Date().toISOString(),
    action,
    policyResult,
    txId,
    topicId: "",
    sequenceNumber: -1,
  };

  return submitMessage(msg);
}

/**
 * Fetch ordered AuditMessages from Mirror Node for the configured HCS topic.
 * Used by the UI audit replay panel.
 */
export async function replay(limit = 50): Promise<AuditMessage[]> {
  const topicId = process.env.HCS_TOPIC_ID;
  if (!topicId) {
    throw new Error(
      "HCS_TOPIC_ID is not set. Run scripts/createTopic.ts to create a topic."
    );
  }
  return fetchMessages(topicId, limit);
}
