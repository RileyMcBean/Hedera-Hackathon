/**
 * GET /api/audit/replay
 * Returns last 50 AuditMessages from HCS for the configured topic.
 */

import { NextResponse } from "next/server";
import { replay } from "../../../../src/audit/trail";

export async function GET() {
  try {
    const messages = await replay(50);
    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
