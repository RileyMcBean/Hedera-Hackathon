"use client";

import { useState } from "react";
import type { PipelineResult } from "../src/runtime/pipeline";
import type { ParseResult } from "../src/agents/intentParser";
import type { AuditMessage } from "../src/schemas/audit";

const DEMO_ACTORS = [
  { id: "0.0.8570111", label: "0.0.8570111 — OPERATOR (100 HBAR limit)" },
];

const DEMO_INSTRUCTIONS = [
  "Send 5 HBAR to 0.0.8570146",
  "Transfer 10 HBAR to 0.0.8570146",
  "Pay 200 HBAR to 0.0.8570146",
  "Send 5 HBAR to 0.0.9999999",
  "Check my balance",
];

type DecisionBadge = {
  label: string;
  className: string;
};

function getBadge(decision?: string): DecisionBadge {
  switch (decision) {
    case "APPROVED":
      return { label: "APPROVED", className: "bg-green-700 text-green-100" };
    case "DENIED":
      return { label: "DENIED", className: "bg-red-700 text-red-100" };
    case "APPROVAL_REQUIRED":
      return { label: "APPROVAL REQUIRED", className: "bg-yellow-700 text-yellow-100" };
    case "MANUAL_REVIEW":
      return { label: "MANUAL REVIEW", className: "bg-orange-700 text-orange-100" };
    default:
      return { label: decision ?? "UNKNOWN", className: "bg-gray-700 text-gray-100" };
  }
}

export default function Home() {
  const [instruction, setInstruction] = useState("");
  const [actorId, setActorId] = useState(DEMO_ACTORS[0].id);
  const [result, setResult] = useState<(PipelineResult & { parseResult?: ParseResult }) | null>(null);
  const [auditLog, setAuditLog] = useState<AuditMessage[]>([]);
  const [auditConfigured, setAuditConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instruction.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, actorId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReplay() {
    setReplayLoading(true);
    try {
      const res = await fetch("/api/audit/replay");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Replay failed");
      setAuditConfigured(data.configured ?? false);
      setAuditLog(data.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReplayLoading(false);
    }
  }

  const badge = result?.policyResult ? getBadge(result.policyResult.decision) : null;
  const hashscanBase = "https://hashscan.io/testnet/transaction";

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="border-b border-gray-800 pb-4">
        <h1 className="text-2xl font-bold text-white">Sika Sentinel</h1>
        <p className="text-gray-400 text-sm mt-1">
          Runtime governance and evidence layer for delegated financial actions on Hedera
        </p>
      </div>

      {/* Instruction input */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-200">Submit Instruction</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Actor</label>
            <select
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
            >
              {DEMO_ACTORS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Natural-language instruction
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              placeholder="e.g. Send 5 HBAR to 0.0.800"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-500 resize-none"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {DEMO_INSTRUCTIONS.map((instr) => (
              <button
                key={instr}
                type="button"
                onClick={() => setInstruction(instr)}
                className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 text-gray-300"
              >
                {instr}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={loading || !instruction.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm font-medium"
          >
            {loading ? "Processing..." : "Submit"}
          </button>
        </form>
      </section>

      {/* Error */}
      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Intent Agent card */}
      {result?.parseResult && (
        <section className="border border-indigo-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Intent Agent
            </span>
            <span className={`text-xs px-2 py-0.5 rounded font-mono ${
              result.parseResult.parserMode === "heuristic"
                ? "bg-indigo-900 text-indigo-300"
                : "bg-purple-900 text-purple-300"
            }`}>
              {result.parseResult.parserMode}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded font-mono ${
              result.parseResult.confidence >= 0.8
                ? "bg-green-900 text-green-300"
                : result.parseResult.confidence >= 0.5
                ? "bg-yellow-900 text-yellow-300"
                : "bg-red-900 text-red-300"
            }`}>
              {Math.round(result.parseResult.confidence * 100)}% confidence
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-400 font-mono">
            <span className="text-gray-500">Intent</span>
            <span className="text-gray-200">{result.parseResult.workflowContext.detectedIntent}</span>

            <span className="text-gray-500">Amount</span>
            <span className="text-gray-200">
              {result.parseResult.workflowContext.extractedAmount !== null
                ? `${result.parseResult.workflowContext.extractedAmount} HBAR`
                : "—"}
            </span>

            <span className="text-gray-500">Recipient</span>
            <span className="text-gray-200">
              {result.parseResult.workflowContext.extractedRecipient ?? "—"}
            </span>

            <span className="text-gray-500">Actor</span>
            <span className="text-gray-200">{result.parseResult.action.actorId}</span>
          </div>

          {result.parseResult.parseErrors.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {result.parseResult.parseErrors.map((e, i) => (
                <li key={i} className="text-xs text-yellow-500">
                  ⚠ {e}
                </li>
              ))}
            </ul>
          )}

          {/* Medium-confidence warnings */}
          {result.parseResult.parseWarnings.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {result.parseResult.parseWarnings.map((w, i) => (
                <li key={i} className="text-xs text-orange-400">
                  ⚡ {w}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Clarification banner — shown instead of Decision when parse is blocked */}
      {result?.parseResult?.clarificationMessage && (
        <section className="border border-amber-700 bg-amber-950/40 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-amber-400">Clarification needed</span>
            <span className="text-xs px-2 py-0.5 rounded bg-amber-900 text-amber-300 font-mono">
              PARSE_BLOCKED
            </span>
          </div>
          <p className="text-sm text-amber-200">{result.parseResult.clarificationMessage}</p>
          <p className="text-xs text-amber-500">
            The instruction was not forwarded to the policy engine or execution layer.
            Please revise your instruction and resubmit.
          </p>
        </section>
      )}

      {/* Decision panel — only shown when parse proceeded */}
      {result && !result.parseResult?.clarificationMessage && (
        <section className="space-y-3 border border-gray-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-gray-200">Decision</h2>
          {badge && (
            <span className={`inline-block px-3 py-1 rounded text-sm font-bold ${badge.className}`}>
              {badge.label}
            </span>
          )}
          {result.policyResult?.denialReason && (
            <p className="text-sm text-gray-400">
              <span className="text-gray-300">Reason:</span>{" "}
              {result.policyResult.denialReason}
            </p>
          )}
          {result.policyResult?.denialDetail && (
            <p className="text-sm text-gray-500">{result.policyResult.denialDetail}</p>
          )}
          {result.balanceHbar !== null && result.balanceHbar !== undefined && (
            <p className="text-sm">
              <span className="text-gray-400">Balance: </span>
              <span className="text-green-300 font-mono font-semibold">
                {result.balanceHbar} HBAR
              </span>
            </p>
          )}
          {result.txId && (
            <p className="text-sm">
              <span className="text-gray-400">Tx ID: </span>
              <a
                href={`${hashscanBase}/${result.txId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline break-all"
              >
                {result.txId}
              </a>
            </p>
          )}
          {result.hcsTopicId && (
            <p className="text-sm text-gray-400">
              HCS sequence #{result.hcsSequenceNumber} on topic {result.hcsTopicId}
            </p>
          )}
          {(() => {
            const rules = result.policyResult?.evaluatedRules ?? [];
            return rules.length > 0 ? (
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer hover:text-gray-400">
                  Rules evaluated ({rules.length})
                </summary>
                <ul className="mt-1 ml-4 list-disc">
                  {rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </details>
            ) : null;
          })()}

          {/* ── DEBUG ── remove before demo ── */}
          <details className="mt-3 border border-yellow-800 rounded p-2 text-xs">
            <summary className="cursor-pointer text-yellow-500 font-bold">
              [DEBUG] Pipeline trace
            </summary>
            <div className="mt-2 space-y-2 text-gray-400">
              <div>
                <span className="text-yellow-600 font-semibold">Raw instruction</span>
                <pre className="mt-0.5 whitespace-pre-wrap break-all text-gray-300">
                  {result.action.rawInstruction}
                </pre>
              </div>
              <div>
                <span className="text-yellow-600 font-semibold">Parsed action</span>
                <pre className="mt-0.5 whitespace-pre-wrap break-all text-gray-300">
                  {JSON.stringify(
                    {
                      actionType: result.action.actionType,
                      actorId: result.action.actorId,
                      recipientId: result.action.recipientId,
                      amountHbar: result.action.amountHbar,
                      correlationId: result.action.correlationId,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
              <div>
                <span className="text-yellow-600 font-semibold">Policy decision</span>
                <pre className="mt-0.5 text-gray-300">
                  {result.policyResult?.decision ?? "null"} (stage: {result.stage})
                </pre>
              </div>
              {result.parseResult && (
                <div>
                  <span className="text-yellow-600 font-semibold">Parse gate</span>
                  <pre className="mt-0.5 text-gray-300">
                    {JSON.stringify(
                      {
                        shouldProceed: result.parseResult.shouldProceed,
                        parseWarnings: result.parseResult.parseWarnings,
                        clarificationMessage: result.parseResult.clarificationMessage,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
              <div>
                <span className="text-yellow-600 font-semibold">Reason / rules</span>
                <pre className="mt-0.5 whitespace-pre-wrap break-all text-gray-300">
                  {JSON.stringify(
                    {
                      denialReason: result.policyResult?.denialReason ?? null,
                      denialDetail: result.policyResult?.denialDetail ?? "",
                      evaluatedRules: result.policyResult?.evaluatedRules ?? [],
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
              {result.error && (
                <div>
                  <span className="text-red-500 font-semibold">Error</span>
                  <pre className="mt-0.5 whitespace-pre-wrap break-all text-red-400">
                    {result.error}
                  </pre>
                </div>
              )}
            </div>
          </details>
          {/* ── END DEBUG ── */}
        </section>
      )}

      {/* Audit replay */}
      <section className="space-y-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-200">Audit Replay</h2>
          <button
            onClick={handleReplay}
            disabled={replayLoading}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm"
          >
            {replayLoading ? "Loading..." : "Refresh"}
          </button>
        </div>
        {auditConfigured === null ? (
          <p className="text-sm text-gray-500">Click Refresh to load the on-chain audit history.</p>
        ) : !auditConfigured ? (
          <p className="text-sm text-yellow-600">
            HCS_TOPIC_ID not configured — run <code className="bg-gray-800 px-1 rounded">npm run create-topic</code> then set the ID in <code className="bg-gray-800 px-1 rounded">.env</code>.
          </p>
        ) : auditLog.length === 0 ? (
          <p className="text-sm text-gray-500">No audit events found yet on this topic.</p>
        ) : (
          <div className="space-y-2">
            {auditLog.map((msg) => {
              const b = getBadge(msg.policyResult.decision);
              return (
                <div
                  key={msg.correlationId}
                  className="border border-gray-800 rounded p-3 text-xs space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${b.className}`}>
                      {b.label}
                    </span>
                    <span className="text-gray-500">#{msg.sequenceNumber}</span>
                    <span className="text-gray-500">{new Date(msg.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-400">{msg.action.rawInstruction}</p>
                  {msg.txId && (
                    <a
                      href={`${hashscanBase}/${msg.txId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      View on HashScan
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
