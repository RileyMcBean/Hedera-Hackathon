/**
 * GET  /api/whitelist?actorId=...  — return current approved recipients
 * POST /api/whitelist              — add a recipient to an actor's approved list
 *   Body: { actorId: string; recipientId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  addApprovedRecipient,
  getApprovedRecipients,
} from "../../../src/context/loader";

export async function GET(req: NextRequest) {
  const actorId = req.nextUrl.searchParams.get("actorId");
  if (!actorId) {
    return NextResponse.json({ error: "actorId query param is required" }, { status: 400 });
  }
  try {
    const recipients = getApprovedRecipients(actorId);
    return NextResponse.json({ actorId, recipients });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 404 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: { actorId?: string; recipientId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { actorId, recipientId } = body;
  if (!actorId || typeof actorId !== "string") {
    return NextResponse.json({ error: "actorId is required" }, { status: 400 });
  }
  if (!recipientId || typeof recipientId !== "string") {
    return NextResponse.json({ error: "recipientId is required" }, { status: 400 });
  }

  // Basic Hedera account ID format validation
  if (!/^\d+\.\d+\.\d+$/.test(recipientId.trim())) {
    return NextResponse.json(
      { error: `'${recipientId}' is not a valid Hedera account ID (expected shard.realm.num)` },
      { status: 400 }
    );
  }

  try {
    addApprovedRecipient(actorId, recipientId.trim());
    const recipients = getApprovedRecipients(actorId);
    return NextResponse.json({ actorId, recipients });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 404 }
    );
  }
}
