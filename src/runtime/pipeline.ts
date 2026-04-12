/**
 * Runtime Pipeline — orchestration layer for Sika Sentinel.
 *
 * runPolicyOnly — context + policy decision (no Hedera calls)
 * run           — full pipeline: policy + execution + HCS audit
 */

import type { Action } from "../schemas/action";
import type { PolicyResult } from "../schemas/policy";
import type { ContextSnapshot } from "../context/loader";
import type { AgentContext } from "../schemas/audit";
import { loadContext } from "../context/loader";
import { evaluatePolicy } from "../policy/engine";
import { executeHbarTransfer } from "../hedera/transfer";
import { queryBalance } from "../hedera/balance";
import { createScheduledTransfer } from "../hedera/schedule";
import { record as recordAudit } from "../audit/trail";

// ── Pipeline stage ────────────────────────────────────────────────────────────

export type PipelineStage =
  | "PARSE_BLOCKED"
  | "POLICY_EVALUATED"
  | "SCHEDULED"
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
  balanceHbar: number | null;   // populated for CHECK_BALANCE actions
  scheduleId: string;           // populated for APPROVAL_REQUIRED scheduled transfers

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
      balanceHbar: null,
      scheduleId: "",
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
    balanceHbar: null,
    scheduleId: "",
    hcsTopicId: "",
    hcsSequenceNumber: -1,
    error: "",
  };
}

// ── Phase 2: full pipeline ────────────────────────────────────────────────────

/**
 * Full pipeline: policy evaluation → (if APPROVED) Hedera transfer → HCS audit.
 * The HCS audit is written for ALL outcomes (approved and denied).
 *
 * Pass agentContext when the action originated from the Intent Parser Agent so
 * the audit event records what the parser believed about the instruction.
 */
export async function run(action: Action, agentContext?: AgentContext): Promise<PipelineResult> {
  // Phase 1
  const phase1 = runPolicyOnly(action);
  if (phase1.stage === "ERROR") return phase1;

  const { context, policyResult } = phase1;

  let txId = "";
  let balanceHbar: number | null = null;
  let scheduleId = "";
  let stage: PipelineStage = "POLICY_EVALUATED";

  const decision = policyResult!.decision;

  if (decision === "APPROVED") {
    if (action.actionType === "HBAR_TRANSFER") {
      // Execute transfer
      try {
        const transferResult = await executeHbarTransfer(action);
        txId = transferResult.txId;
        stage = "EXECUTED";
      } catch (err) {
        return {
          ...phase1,
          balanceHbar: null,
          scheduleId: "",
          stage: "ERROR",
          error: `Transfer failed: ${err}`,
        };
      }
    } else if (action.actionType === "CHECK_BALANCE") {
      // Execute balance query
      try {
        const balanceResult = await queryBalance(action);
        balanceHbar = balanceResult.balanceHbar;
        stage = "EXECUTED";
      } catch (err) {
        return {
          ...phase1,
          balanceHbar: null,
          scheduleId: "",
          stage: "ERROR",
          error: `Balance query failed: ${err}`,
        };
      }
    }
  } else if (decision === "APPROVAL_REQUIRED" && action.actionType === "HBAR_TRANSFER") {
    // Create a scheduled transaction — funds are NOT released until a
    // second signer submits a ScheduleSignTransaction.
    try {
      const schedResult = await createScheduledTransfer(action);
      scheduleId = schedResult.scheduleId;
      stage = "SCHEDULED";
    } catch {
      // Scheduled tx creation failed — non-fatal, fall through to audit
      // with stage still POLICY_EVALUATED so it's clear no schedule was created.
    }
  }

  // Write audit record for all outcomes (approved, denied, scheduled, etc.)
  let hcsTopicId = "";
  let hcsSequenceNumber = -1;
  try {
    const auditMsg = await recordAudit(action, policyResult!, txId, agentContext, scheduleId);
    hcsTopicId = auditMsg.topicId;
    hcsSequenceNumber = auditMsg.sequenceNumber;
    if (stage !== "SCHEDULED") stage = "AUDITED";
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
    balanceHbar,
    scheduleId,
    hcsTopicId,
    hcsSequenceNumber,
    error: "",
  };
}
