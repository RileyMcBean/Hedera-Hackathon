/**
 * HCS Client — Hedera Consensus Service integration.
 *
 * submitMessage: writes an AuditMessage to the configured HCS topic.
 * fetchMessages: reads ordered messages from the Mirror Node for audit replay.
 */

import type { AuditMessage } from "../schemas/audit";
import { AuditMessageSchema } from "../schemas/audit";
import { hederaConfigFromEnv } from "./config";

const MIRROR_NODE_URL =
  process.env.MIRROR_NODE_URL ?? "https://testnet.mirrornode.hedera.com";

// ── Submit message ────────────────────────────────────────────────────────────

/**
 * Submit an AuditMessage to the HCS topic specified by HCS_TOPIC_ID.
 * Populates topicId and sequenceNumber on the returned message.
 */
export async function submitMessage(msg: AuditMessage): Promise<AuditMessage> {
  const topicId = process.env.HCS_TOPIC_ID;
  if (!topicId) {
    throw new Error(
      "HCS_TOPIC_ID is not set. Run scripts/createTopic.ts to create a topic."
    );
  }

  let sdk: typeof import("@hashgraph/sdk");
  try {
    sdk = await import("@hashgraph/sdk");
  } catch {
    throw new Error(
      "@hashgraph/sdk is not installed. Run: npm install @hashgraph/sdk"
    );
  }

  const { Client, AccountId, PrivateKey, TopicMessageSubmitTransaction, TopicId } = sdk;

  const config = hederaConfigFromEnv();
  const client =
    config.network === "testnet" ? Client.forTestnet() : Client.forMainnet();
  client.setOperator(
    AccountId.fromString(config.operatorId),
    PrivateKey.fromStringECDSA(config.operatorKey.replace(/^0x/i, ''))
  );

  const payload = JSON.stringify(msg);

  const txResponse = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(payload)
    .execute(client);

  const receipt = await txResponse.getReceipt(client);
  const sequenceNumber = Number(receipt.topicSequenceNumber);

  return {
    ...msg,
    topicId,
    sequenceNumber,
  };
}

// ── Fetch messages ────────────────────────────────────────────────────────────

interface MirrorNodeMessage {
  consensus_timestamp: string;
  message: string; // base64-encoded
  sequence_number: number;
  topic_id: string;
}

interface MirrorNodeResponse {
  messages: MirrorNodeMessage[];
}

/**
 * Fetch ordered AuditMessages from the Mirror Node for a given HCS topic.
 */
export async function fetchMessages(
  topicId: string,
  limit = 100
): Promise<AuditMessage[]> {
  const url = `${MIRROR_NODE_URL}/api/v1/topics/${topicId}/messages?limit=${limit}&order=asc`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Mirror Node request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as MirrorNodeResponse;

  const messages: AuditMessage[] = [];
  for (const item of data.messages ?? []) {
    try {
      const decoded = Buffer.from(item.message, "base64").toString("utf-8");
      const parsed = AuditMessageSchema.parse(JSON.parse(decoded));
      messages.push({
        ...parsed,
        topicId: item.topic_id,
        sequenceNumber: item.sequence_number,
      });
    } catch {
      // Skip malformed messages
    }
  }

  return messages;
}
