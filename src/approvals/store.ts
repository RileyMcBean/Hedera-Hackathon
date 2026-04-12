/**
 * In-memory pending approval store.
 * Lives for the lifetime of the Next.js server process.
 *
 * IMPORTANT: stored on globalThis so the Map is shared across all Next.js
 * webpack bundles within the same Node.js process. A plain module-level
 * variable would be isolated per bundle — the Map written by /api/run would
 * be invisible to /api/approvals/[id], breaking the whole approval flow.
 */

import type { Action } from "../schemas/action";
import type { PolicyResult } from "../schemas/policy";

export type ApprovalStatus = "PENDING" | "APPROVED" | "DENIED";

export interface PendingApproval {
  id: string;
  action: Action;
  /** The original APPROVAL_REQUIRED policy result */
  policyResult: PolicyResult;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt: string;
  txId: string;
  hcsTopicId: string;
  hcsSequenceNumber: number;
  /** Unique ntfy.sh topic the approval response will be published to */
  ntfyResponseTopic: string;
}

// Singleton pattern: attach to globalThis so all route bundles share one Map.
const g = globalThis as typeof globalThis & {
  _sikaApprovalStore?: Map<string, PendingApproval>;
};
if (!g._sikaApprovalStore) {
  g._sikaApprovalStore = new Map<string, PendingApproval>();
}
const _store = g._sikaApprovalStore;

export function createApproval(
  id: string,
  action: Action,
  policyResult: PolicyResult,
  ntfyResponseTopic: string
): PendingApproval {
  const approval: PendingApproval = {
    id,
    action,
    policyResult,
    status: "PENDING",
    createdAt: new Date().toISOString(),
    resolvedAt: "",
    txId: "",
    hcsTopicId: "",
    hcsSequenceNumber: -1,
    ntfyResponseTopic,
  };
  _store.set(id, approval);
  return approval;
}

export function getApproval(id: string): PendingApproval | undefined {
  return _store.get(id);
}

export function updateApproval(id: string, patch: Partial<PendingApproval>): void {
  const existing = _store.get(id);
  if (existing) _store.set(id, { ...existing, ...patch });
}
