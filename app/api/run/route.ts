/**
 * POST /api/run
 * Body: { instruction: string; actorId: string }
 * Response: PipelineResult JSON
 */

import { NextRequest, NextResponse } from "next/server";
import { parseInstruction } from "../../../src/agents/intentParser";
import { run } from "../../../src/runtime/pipeline";

export async function POST(req: NextRequest) {
  let body: { instruction?: string; actorId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { instruction, actorId } = body;
  if (!instruction || typeof instruction !== "string") {
    return NextResponse.json(
      { error: "instruction is required" },
      { status: 400 }
    );
  }
  if (!actorId || typeof actorId !== "string") {
    return NextResponse.json({ error: "actorId is required" }, { status: 400 });
  }

  try {
    const action = await parseInstruction(instruction, actorId);
    const result = await run(action);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
