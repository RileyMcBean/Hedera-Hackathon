/**
 * POST /api/run
 * Body: { instruction: string; actorId: string }
 * Response: PipelineResult JSON, with optional approvalId when APPROVAL_REQUIRED.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { parseInstruction } from "../../../src/agents/intentParser";
import { run } from "../../../src/runtime/pipeline";
import { createApproval } from "../../../src/approvals/store";
import { sendApprovalNotification } from "../../../src/approvals/notifier";

export async function POST(req: NextRequest) {
  let body: { instruction?: string; actorId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { instruction, actorId } = body;
  if (!instruction || typeof instruction !== "string") {
    return NextResponse.json({ error: "instruction is required" }, { status: 400 });
  }
  if (!actorId || typeof actorId !== "string") {
    return NextResponse.json({ error: "actorId is required" }, { status: 400 });
  }

  try {
    const action = await parseInstruction(instruction, actorId);
    const result = await run(action);

    if (result.policyResult?.decision === "APPROVAL_REQUIRED") {
      const approvalId = randomUUID();
      const ntfyResponseTopic = `sika-${approvalId}`;
      const ntfyTopic = process.env.NTFY_TOPIC;

      createApproval(approvalId, action, result.policyResult, ntfyResponseTopic);

      if (ntfyTopic) {
        const actorRole = result.context?.actorRole ?? "Unknown";
        // Fire and forget — a notification failure should not block the response
        sendApprovalNotification(ntfyTopic, ntfyResponseTopic, action, actorRole).catch(
          (err) => console.error("[ntfy] Notification failed:", err)
        );
      } else {
        console.warn("[ntfy] NTFY_TOPIC is not set — phone notification skipped");
      }

      return NextResponse.json({ ...result, approvalId });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
