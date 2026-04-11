/**
 * HederaConfig — validated Hedera credentials and network settings.
 * Loaded from environment variables.
 */

export interface HederaConfig {
  readonly network: string;      // "testnet" | "mainnet"
  readonly operatorId: string;   // Hedera account ID paying fees
  readonly operatorKey: string;  // DER-encoded ED25519 private key for operator
  readonly treasuryId: string;   // Payout source account ID
  readonly treasuryKey: string;  // DER-encoded ED25519 private key for treasury
}

/**
 * Load and validate Hedera config from environment variables.
 *
 * @throws {Error} If any required variable is missing or blank.
 */
export function hederaConfigFromEnv(): HederaConfig {
  const network = process.env.HEDERA_NETWORK ?? "testnet";
  const operatorId = process.env.HEDERA_OPERATOR_ID ?? "";
  const operatorKey = process.env.HEDERA_OPERATOR_KEY ?? "";

  const missing: string[] = [];
  if (!operatorId) missing.push("HEDERA_OPERATOR_ID");
  if (!operatorKey) missing.push("HEDERA_OPERATOR_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required Hedera environment variables: ${JSON.stringify(missing)}. ` +
        "Copy .env.example to .env and fill in the values."
    );
  }

  // Treasury defaults to operator when not separately configured
  const treasuryId = process.env.HEDERA_TREASURY_ID || operatorId;
  const treasuryKey = process.env.HEDERA_TREASURY_KEY || operatorKey;

  return Object.freeze({ network, operatorId, operatorKey, treasuryId, treasuryKey });
}
