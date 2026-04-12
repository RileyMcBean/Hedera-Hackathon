/**
 * Payload integrity — SHA-256 hash for HCS audit events.
 *
 * The hash is computed over a canonical JSON serialization of the audit
 * payload with the `payloadHash` field itself EXCLUDED. This means:
 *   1. On write: build the message, remove payloadHash, serialize with
 *      sorted keys, hash, then attach the hash before submitting to HCS.
 *   2. On replay: parse the message, extract payloadHash, remove it,
 *      re-serialize with sorted keys, hash, and compare.
 *
 * Canonical serialization uses JSON.stringify with sorted keys so that
 * field insertion order does not affect the hash. This is sufficient for
 * demo-grade integrity verification — not a substitute for cryptographic
 * signatures or Merkle proofs.
 */

import { createHash } from "crypto";
import type { AuditMessage } from "../schemas/audit";

/**
 * Produce a deterministic JSON string with keys sorted recursively.
 * Guarantees the same object always produces the same byte sequence.
 */
function canonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalize).join(",") + "]";
  }
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((k) => JSON.stringify(k) + ":" + canonicalize((obj as Record<string, unknown>)[k]));
  return "{" + sorted.join(",") + "}";
}

/**
 * Compute the SHA-256 hash of the audit payload, excluding `payloadHash`.
 */
export function computePayloadHash(msg: AuditMessage): string {
  // Shallow copy, strip the hash field so it doesn't feed into itself
  const { payloadHash: _, ...rest } = msg;
  const canonical = canonicalize(rest);
  return createHash("sha256").update(canonical, "utf-8").digest("hex");
}

/**
 * Verify that a fetched audit message's payload matches its stored hash.
 * Returns true if the recomputed hash equals the stored `payloadHash`.
 * Returns false if the hash is missing (pre-integrity events) or mismatched.
 */
export function verifyPayloadHash(msg: AuditMessage): boolean {
  if (!msg.payloadHash) return false; // no hash to verify
  return computePayloadHash(msg) === msg.payloadHash;
}
