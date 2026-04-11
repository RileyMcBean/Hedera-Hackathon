/**
 * Create an HCS topic for the Sika Sentinel audit trail.
 * Run: npx tsx scripts/createTopic.ts
 * Copy the printed topic ID to HCS_TOPIC_ID in your .env file.
 */

import "dotenv/config";
import { hederaConfigFromEnv } from "../src/hedera/config";

async function main() {
  const config = hederaConfigFromEnv();

  const sdk = await import("@hashgraph/sdk");
  const { Client, AccountId, PrivateKey, TopicCreateTransaction } = sdk;

  const client =
    config.network === "testnet" ? Client.forTestnet() : Client.forMainnet();
  client.setOperator(
    AccountId.fromString(config.operatorId),
    PrivateKey.fromStringED25519(config.operatorKey.replace(/^0x/i, ''))
  );

  const tx = await new TopicCreateTransaction()
    .setTopicMemo("Sika Sentinel Audit Trail")
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const topicId = receipt.topicId!.toString();

  console.log(`\nHCS topic created successfully!`);
  console.log(`Topic ID: ${topicId}`);
  console.log(`\nAdd to your .env file:`);
  console.log(`HCS_TOPIC_ID=${topicId}`);
  console.log(
    `\nView on HashScan: https://hashscan.io/${config.network}/topic/${topicId}`
  );

  client.close();
}

main().catch((err) => {
  console.error("Failed to create topic:", err);
  process.exit(1);
});
