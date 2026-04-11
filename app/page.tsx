"use client";

import { useState } from "react";
import type { PipelineResult } from "../src/runtime/pipeline";
import type { AuditMessage } from "../src/schemas/audit";

const DEMO_ACTORS = [
  { id: "0.0.100", label: "0.0.100 — OPERATOR (100 HBAR limit)" },
  { id: "0.0.200", label: "0.0.200 — PARTNER (25 HBAR limit)" },
  { id: "0.0.300", label: "0.0.300 — ADMIN (500 HBAR limit, open access)" },
];

const DEMO_INSTRUCTIONS = [
  "Send 5 HBAR to 0.0.800",
  "Transfer 10 HBAR to 0.0.801",
  "Pay 200 HBAR to 0.0.800",
  "Send 5 HBAR to 0.0.999",
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
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [auditLog, setAuditLog] = useState<AuditMessage[]>([]);
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

      {/* Decision panel */}
      {result && (
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
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer hover:text-gray-400">
              Rules evaluated
            </summary>
            <ul className="mt-1 ml-4 list-disc">
              {result.policyResult?.evaluatedRules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
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
        {auditLog.length === 0 ? (
          <p className="text-sm text-gray-500">
            Click Refresh to load the on-chain audit history.
          </p>
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
