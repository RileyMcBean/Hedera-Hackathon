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
import { record as recordAudit } from "../../../src/audit/trail";
import type { AgentContext } from "../../../src/schemas/audit";

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
      const clarification = parseResult.clarificationMessage ?? "Instruction too ambiguous to process.";

      const agentContext: AgentContext = {
        parserMode: parseResult.parserMode,
        confidence: parseResult.confidence,
        parseWarnings: parseResult.parseWarnings,
        rawInstruction: parseResult.workflowContext.rawInstruction,
      };

      // Synthetic policy result — no execution, but the non-proceed outcome is
      // still recorded to HCS so the evidence trail is complete.
      const blockedPolicyResult = {
        decision: "DENIED" as const,
        denialReason: null,
        denialDetail: clarification,
        evaluatedRules: [] as string[],
      };

      let hcsTopicId = "";
      let hcsSequenceNumber = -1;
      try {
        const auditMsg = await recordAudit(
          parseResult.action,
          blockedPolicyResult,
          "",           // no txId — execution never ran
          agentContext
        );
        hcsTopicId = auditMsg.topicId;
        hcsSequenceNumber = auditMsg.sequenceNumber;
      } catch {
        // Audit failure is non-fatal — still return the PARSE_BLOCKED response
      }

      return NextResponse.json({
        action: parseResult.action,
        context: null,
        policyResult: blockedPolicyResult,
        stage: "PARSE_BLOCKED",
        timestamp: new Date().toISOString(),
        txId: "",
        balanceHbar: null,
        scheduleId: "",
        hcsTopicId,
        hcsSequenceNumber,
        error: clarification,
        parseResult,
      });
    }

    // Build agent context to embed in the audit event
    const agentContext: AgentContext = {
      parserMode: parseResult.parserMode,
      confidence: parseResult.confidence,
      parseWarnings: parseResult.parseWarnings,
      rawInstruction: parseResult.workflowContext.rawInstruction,
    };

    // Stage 2: Runtime pipeline — policy + execution + audit
    const pipelineResult = await run(parseResult.action, agentContext);

    // Merge: pipeline result fields stay top-level; parseResult is nested
    return NextResponse.json({ ...pipelineResult, parseResult });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
