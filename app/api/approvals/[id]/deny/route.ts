/**
 * POST /api/approvals/[id]/deny
 * UI fallback — deny directly without going through Ntfy.
 */

import { NextRequest, NextResponse } from "next/server";
import { denyApproval } from "../../../../../src/approvals/executor";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const resolved = await denyApproval(params.id);
    return NextResponse.json(resolved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
