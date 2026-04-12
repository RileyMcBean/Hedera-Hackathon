/**
 * GET /api/approvals/[id]
 *
 * Returns the current status of a pending approval.
 * While PENDING, polls the Ntfy response topic for a decision and
 * executes lazily if the user has responded on their phone.
 */

import { NextRequest, NextResponse } from "next/server";
import { getApproval } from "../../../../src/approvals/store";
import { pollNtfyForDecision } from "../../../../src/approvals/notifier";
import { approveAndExecute, denyApproval } from "../../../../src/approvals/executor";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const approval = getApproval(id);

  if (!approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  if (approval.status !== "PENDING") {
    return NextResponse.json(approval);
  }

  // Check the Ntfy relay topic for a phone-side decision
  const decision = await pollNtfyForDecision(approval.ntfyResponseTopic);

  if (decision === "APPROVE") {
    try {
      const resolved = await approveAndExecute(id);
      return NextResponse.json(resolved);
    } catch (err) {
      return NextResponse.json(
        { error: `Execution failed: ${err}` },
        { status: 500 }
      );
    }
  }

  if (decision === "DENY") {
    const resolved = await denyApproval(id);
    return NextResponse.json(resolved);
  }

  // Still pending
  return NextResponse.json(approval);
}
