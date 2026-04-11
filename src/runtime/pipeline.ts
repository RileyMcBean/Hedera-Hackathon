/**
 * Runtime Pipeline — orchestration layer for Sika Sentinel.
 *
 * runPolicyOnly — context + policy decision (no Hedera calls)
 * run           — full pipeline: policy + execution + HCS audit
 */

import type { Action } from "../schemas/action";
import type { PolicyResult } from "../schemas/policy";
import type { ContextSnapshot } from "../context/loader";
import { loadContext } from "../context/loader";
import { evaluatePolicy } from "../policy/engine";
import { executeHbarTransfer } from "../hedera/transfer";
import { record as recordAudit } from "../audit/trail";

// ── Pipeline stage ────────────────────────────────────────────────────────────

export type PipelineStage =
  | "POLICY_EVALUATED"
  | "EXECUTED"
  | "AUDITED"
  | "ERROR";

// ── Pipeline result ───────────────────────────────────────────────────────────

export interface PipelineResult {
  action: Action;
  context: ContextSnapshot | null;
  policyResult: PolicyResult | null;
  stage: PipelineStage;
  timestamp: string;  // ISO 8601

  // Phase 2 — Hedera execution
  txId: string;

  // Phase 2 — HCS audit
  hcsTopicId: string;
  hcsSequenceNumber: number;

  // Error path
  error: string;
}

function now(): string {
  return new Date().toISOString();
}

/** True only when policy returned APPROVED */
export function isApproved(result: PipelineResult): boolean {
  return result.policyResult?.decision === "APPROVED";
}

/** Human-readable one-word label for UI display */
export function decisionLabel(result: PipelineResult): string {
  if (result.stage === "ERROR") return "ERROR";
  if (!result.policyResult) return "UNKNOWN";
  return result.policyResult.decision;
}

// ── Phase 1: policy-only pipeline ────────────────────────────────────────────

/**
 * Load context and evaluate policy. No Hedera calls.
 * Returns stage=ERROR if actor is unknown; stage=POLICY_EVALUATED otherwise.
 */
export function runPolicyOnly(action: Action): PipelineResult {
  let context: ContextSnapshot;
  try {
    context = loadContext(action.actorId, action.recipientId);
  } catch (err) {
    return {
      action,
      context: null,
      policyResult: null,
      stage: "ERROR",
      timestamp: now(),
      txId: "",
      hcsTopicId: "",
      hcsSequenceNumber: -1,
      error: String(err),
    };
  }

  const policyResult = evaluatePolicy(action, context);

  return {
    action,
    context,
    policyResult,
    stage: "POLICY_EVALUATED",
    timestamp: now(),
    txId: "",
    hcsTopicId: "",
    hcsSequenceNumber: -1,
    error: "",
  };
}

// ── Phase 2: full pipeline ────────────────────────────────────────────────────

/**
 * Full pipeline: policy evaluation → (if APPROVED) Hedera transfer → HCS audit.
 * The HCS audit is written for ALL outcomes (approved and denied).
 */
export async function run(action: Action): Promise<PipelineResult> {
  // Phase 1
  const phase1 = runPolicyOnly(action);
  if (phase1.stage === "ERROR") return phase1;

  const { context, policyResult } = phase1;

  let txId = "";
  let stage: PipelineStage = "POLICY_EVALUATED";

  // Execute transfer only when approved
  if (policyResult!.decision === "APPROVED") {
    try {
      const transferResult = await executeHbarTransfer(action);
      txId = transferResult.txId;
      stage = "EXECUTED";
    } catch (err) {
      return {
        ...phase1,
        stage: "ERROR",
        error: `Transfer failed: ${err}`,
      };
    }
  }

  // Write audit record for all outcomes
  let hcsTopicId = "";
  let hcsSequenceNumber = -1;
  try {
    const auditMsg = await recordAudit(action, policyResult!, txId);
    hcsTopicId = auditMsg.topicId;
    hcsSequenceNumber = auditMsg.sequenceNumber;
    stage = "AUDITED";
  } catch {
    // Audit failure is non-fatal — log and continue
  }

  return {
    action,
    context,
    policyResult,
    stage,
    timestamp: now(),
    txId,
    hcsTopicId,
    hcsSequenceNumber,
    error: "",
  };
}
