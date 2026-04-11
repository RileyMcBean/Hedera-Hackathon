/**
 * POST /api/run
 * Body: { instruction: string; actorId: string }
 *
 * Response: PipelineResult merged with { parseResult: ParseResult }
 * All existing PipelineResult fields are at the top level; parseResult is nested.
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
    return NextResponse.json({ error: "instruction is required" }, { status: 400 });
  }
  if (!actorId || typeof actorId !== "string") {
    return NextResponse.json({ error: "actorId is required" }, { status: 400 });
  }

  try {
    // Stage 1: Intent Agent — parse natural language → structured action
    const parseResult = await parseInstruction(instruction, actorId);

    // Guard: do not proceed when confidence is too low or instruction is ambiguous
    if (!parseResult.shouldProceed) {
      return NextResponse.json({
        action: parseResult.action,
        context: null,
        policyResult: null,
        stage: "PARSE_BLOCKED",
        timestamp: new Date().toISOString(),
        txId: "",
        balanceHbar: null,
        hcsTopicId: "",
        hcsSequenceNumber: -1,
        error: parseResult.clarificationMessage ?? "Instruction too ambiguous to process.",
        parseResult,
      });
    }

    // Stage 2: Runtime pipeline — policy + execution + audit
    const pipelineResult = await run(parseResult.action);

    // Merge: pipeline result fields stay top-level; parseResult is nested
    return NextResponse.json({ ...pipelineResult, parseResult });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
