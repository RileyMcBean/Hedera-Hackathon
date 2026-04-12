/**
 * POST /api/approvals/[id]/approve
 * UI fallback — approve and execute directly without going through Ntfy.
 */

import { NextRequest, NextResponse } from "next/server";
import { approveAndExecute } from "../../../../../src/approvals/executor";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const resolved = await approveAndExecute(params.id);
    return NextResponse.json(resolved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
