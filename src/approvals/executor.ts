/**
 * Shared logic for resolving a pending approval — used by both the
 * poll-based GET route (Ntfy relay) and the direct POST routes (UI fallback).
 */

import { getApproval, updateApproval } from "./store";
import type { PendingApproval } from "./store";
import { executeHbarTransfer } from "../hedera/transfer";
import { record as recordAudit } from "../audit/trail";
import type { PolicyResult } from "../schemas/policy";

export async function approveAndExecute(id: string): Promise<PendingApproval> {
  const approval = getApproval(id);
  if (!approval) throw new Error(`Approval ${id} not found`);
  if (approval.status !== "PENDING") return approval;

  const transferResult = await executeHbarTransfer(approval.action);
  const auditMsg = await recordAudit(
    approval.action,
    approval.policyResult,
    transferResult.txId
  );

  updateApproval(id, {
    status: "APPROVED",
    txId: transferResult.txId,
    hcsTopicId: auditMsg.topicId,
    hcsSequenceNumber: auditMsg.sequenceNumber,
    resolvedAt: new Date().toISOString(),
  });

  return getApproval(id)!;
}

export async function denyApproval(id: string): Promise<PendingApproval> {
  const approval = getApproval(id);
  if (!approval) throw new Error(`Approval ${id} not found`);
  if (approval.status !== "PENDING") return approval;

  const deniedPolicyResult: PolicyResult = {
    decision: "DENIED",
    denialReason: null,
    denialDetail: "Approval request was declined by the account holder",
    evaluatedRules: approval.policyResult.evaluatedRules,
  };

  try {
    const auditMsg = await recordAudit(approval.action, deniedPolicyResult, "");
    updateApproval(id, {
      status: "DENIED",
      hcsTopicId: auditMsg.topicId,
      hcsSequenceNumber: auditMsg.sequenceNumber,
      resolvedAt: new Date().toISOString(),
    });
  } catch {
    updateApproval(id, {
      status: "DENIED",
      resolvedAt: new Date().toISOString(),
    });
  }

  return getApproval(id)!;
}
