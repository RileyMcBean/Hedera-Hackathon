/**
 * POST /api/schedule/approve
 * Body: { scheduleId: string }
 *
 * Submits a secondary signature (ScheduleSignTransaction) to approve a
 * pending scheduled transfer. Records the approval to the HCS audit trail.
 */

import { NextRequest, NextResponse } from "next/server";
import { record as recordAudit } from "../../../../src/audit/trail";
import type { Action } from "../../../../src/schemas/action";

export async function POST(req: NextRequest) {
  let body: { scheduleId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scheduleId } = body;
  if (!scheduleId || typeof scheduleId !== "string") {
    return NextResponse.json(
      { error: "scheduleId is required" },
      { status: 400 }
    );
  }

  // Basic Hedera entity ID format validation
  if (!/^\d+\.\d+\.\d+$/.test(scheduleId.trim())) {
    return NextResponse.json(
      {
        error: `'${scheduleId}' is not a valid Hedera schedule ID (expected shard.realm.num)`,
      },
      { status: 400 }
    );
  }

  try {
    // Dynamic import — same pattern as pipeline.ts to avoid Next.js bundling issues
    const { approveScheduledTransfer } = await import(
      "../../../../src/hedera/schedule"
    );

    const result = await approveScheduledTransfer(scheduleId.trim());

    // Record the approval as a separate audit event so the lifecycle is visible.
    // Use a synthetic action so the audit schema is satisfied.
    const approvalAction: Action = {
      correlationId: `approval-${scheduleId.trim()}-${Date.now()}`,
      actionType: "HBAR_TRANSFER",
      actorId: process.env.HEDERA_APPROVER_ID || process.env.HEDERA_TREASURY_ID || "",
      recipientId: "",
      amountHbar: 0,
      rawInstruction: `Secondary approval for schedule ${scheduleId.trim()}`,
      memo: "",
    };

    const approvalPolicyResult = {
      decision: "APPROVED" as const,
      denialReason: null,
      denialDetail: `Schedule ${scheduleId.trim()} approved via ScheduleSignTransaction`,
      evaluatedRules: [] as string[],
    };

    let hcsTopicId = "";
    let hcsSequenceNumber = -1;
    try {
      const auditMsg = await recordAudit(
        approvalAction,
        approvalPolicyResult,
        result.signTxId,
        undefined,
        scheduleId.trim()
      );
      hcsTopicId = auditMsg.topicId;
      hcsSequenceNumber = auditMsg.sequenceNumber;
    } catch {
      // Audit failure is non-fatal
    }

    return NextResponse.json({
      ...result,
      hcsTopicId,
      hcsSequenceNumber,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
