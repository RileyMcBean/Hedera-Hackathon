"use client";

import { useState } from "react";
import type { PipelineResult } from "../src/runtime/pipeline";
import type { ParseResult } from "../src/agents/intentParser";
import type { AuditMessage } from "../src/schemas/audit";
import type { ContextSnapshot } from "../src/context/loader";

const DEMO_ACTORS = [
  { id: "0.0.8570111", label: "0.0.8570111 — OPERATOR (100 HBAR limit)" },
];

const DEMO_INSTRUCTIONS: { label: string; text: string; tag: string; tagClass: string }[] = [
  // ── Approved transfers (recipient 0.0.8598115 — external wallet, not treasury) ──
  {
    label: "Small transfer — approved",
    text: "Send 5 HBAR to 0.0.8598115",
    tag: "APPROVED",
    tagClass: "bg-green-900 text-green-300",
  },
  {
    label: "Alternate phrasing — approved",
    text: "Please transfer 10 HBAR to account 0.0.8598115 for the weekly payout",
    tag: "APPROVED",
    tagClass: "bg-green-900 text-green-300",
  },
  // ── Approval required ─────────────────────────────────────────────────────
  {
    label: "High-value — approval required",
    text: "Wire 150 HBAR to 0.0.8598115",
    tag: "APPROVAL REQ",
    tagClass: "bg-yellow-900 text-yellow-300",
  },
  // ── Denied ───────────────────────────────────────────────────────────────
  {
    label: "Unapproved recipient — denied",
    text: "Send 5 HBAR to 0.0.9999999",
    tag: "DENIED",
    tagClass: "bg-red-900 text-red-300",
  },
  // ── Balance check ─────────────────────────────────────────────────────────
  {
    label: "Balance check",
    text: "What is the current balance on this account?",
    tag: "BALANCE",
    tagClass: "bg-indigo-900 text-indigo-300",
  },
  // ── Ambiguous — triggers clarification ───────────────────────────────────
  {
    label: "Vague — clarification needed",
    text: "Send money",
    tag: "BLOCKED",
    tagClass: "bg-amber-900 text-amber-300",
  },
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

  // Whitelist panel state
  const [whitelist, setWhitelist] = useState<string[] | null>(null);
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [newRecipient, setNewRecipient] = useState("");
  const [whitelistError, setWhitelistError] = useState("");

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

  async function loadWhitelist(actor: string) {
    setWhitelistLoading(true);
    setWhitelistError("");
    try {
      const res = await fetch(`/api/whitelist?actorId=${encodeURIComponent(actor)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load whitelist");
      setWhitelist(data.recipients ?? []);
    } catch (err) {
      setWhitelistError(err instanceof Error ? err.message : String(err));
    } finally {
      setWhitelistLoading(false);
    }
  }

  async function handleAddRecipient(e: React.FormEvent) {
    e.preventDefault();
    if (!newRecipient.trim()) return;
    setWhitelistLoading(true);
    setWhitelistError("");
    try {
      const res = await fetch("/api/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, recipientId: newRecipient.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add recipient");
      setWhitelist(data.recipients ?? []);
      setNewRecipient("");
    } catch (err) {
      setWhitelistError(err instanceof Error ? err.message : String(err));
    } finally {
      setWhitelistLoading(false);
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
          <div className="flex flex-col gap-1.5">
            {DEMO_INSTRUCTIONS.map((instr) => (
              <button
                key={instr.text}
                type="button"
                onClick={() => setInstruction(instr.text)}
                className="flex items-center gap-2 text-left px-2 py-1.5 bg-gray-800 border border-gray-700 rounded hover:bg-gray-750 hover:border-gray-600 text-gray-300 group"
              >
                <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-mono font-bold ${instr.tagClass}`}>
                  {instr.tag}
                </span>
                <span className="text-xs text-gray-400 group-hover:text-gray-200">{instr.label}</span>
                <span className="ml-auto text-xs text-gray-600 font-mono truncate max-w-xs hidden sm:block">
                  {instr.text}
                </span>
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

      {/* Approved Recipient Whitelist */}
      <section className="border border-gray-700 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-200">Approved Recipients</span>
          <span className="text-xs text-gray-600 font-mono">· actor: {actorId}</span>
          <button
            type="button"
            onClick={() => loadWhitelist(actorId)}
            disabled={whitelistLoading}
            className="ml-auto text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 disabled:opacity-50"
          >
            {whitelistLoading ? "Loading…" : whitelist === null ? "Load" : "Refresh"}
          </button>
        </div>

        {whitelistError && (
          <p className="text-xs text-red-400">{whitelistError}</p>
        )}

        {whitelist === null ? (
          <p className="text-xs text-gray-600">
            Click Load to see the approved recipient list for this actor.
          </p>
        ) : whitelist.length === 0 ? (
          <p className="text-xs text-gray-500">No approved recipients configured.</p>
        ) : (
          <ul className="space-y-1">
            {whitelist.map((r) => (
              <li key={r} className="text-xs font-mono text-gray-300 bg-gray-900 rounded px-2 py-1">
                {r}
              </li>
            ))}
          </ul>
        )}

        {/* Add new recipient */}
        <form onSubmit={handleAddRecipient} className="flex gap-2">
          <input
            type="text"
            value={newRecipient}
            onChange={(e) => setNewRecipient(e.target.value)}
            placeholder="0.0.xxxxxxx"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs font-mono text-gray-100 placeholder-gray-600"
          />
          <button
            type="submit"
            disabled={whitelistLoading || !newRecipient.trim()}
            className="text-xs px-3 py-1.5 bg-teal-700 hover:bg-teal-600 disabled:opacity-50 rounded font-medium"
          >
            Add
          </button>
        </form>
      </section>

      {/* Error */}
      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── Stage 1: Intent Parser Agent ─────────────────────────────────────── */}
      {result?.parseResult && (
        <section className={`rounded-lg p-4 space-y-3 border ${
          result.parseResult.clarificationMessage
            ? "border-amber-700 bg-amber-950/20"
            : "border-indigo-800"
        }`}>

          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-mono select-none">STAGE 1</span>
            <span className="text-sm font-bold text-indigo-300">Intent Parser Agent</span>
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
            {result.parseResult.clarificationMessage ? (
              <span className="ml-auto text-xs px-2 py-0.5 rounded bg-amber-900 text-amber-300 font-mono font-bold">
                FLOW STOPPED
              </span>
            ) : (
              <span className="ml-auto text-xs px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 font-mono">
                PASSED
              </span>
            )}
          </div>

          {/* Raw instruction */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Raw instruction</p>
            <p className="text-xs font-mono text-gray-300 bg-gray-900 rounded px-2 py-1 break-all">
              {result.parseResult.workflowContext.rawInstruction}
            </p>
          </div>

          {/* Extracted fields grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
            <span className="text-gray-500">Action type</span>
            <span className="text-gray-200">{result.parseResult.workflowContext.detectedIntent}</span>

            <span className="text-gray-500">Amount</span>
            <span className={result.parseResult.workflowContext.extractedAmount !== null ? "text-gray-200" : "text-gray-600"}>
              {result.parseResult.workflowContext.extractedAmount !== null
                ? `${result.parseResult.workflowContext.extractedAmount} HBAR`
                : "not found"}
            </span>

            <span className="text-gray-500">Recipient</span>
            <span className={result.parseResult.workflowContext.extractedRecipient !== null ? "text-gray-200" : "text-gray-600"}>
              {result.parseResult.workflowContext.extractedRecipient ?? "not found"}
            </span>

            <span className="text-gray-500">Actor</span>
            <span className="text-gray-200">{result.parseResult.action.actorId}</span>
          </div>

          {/* Parse errors */}
          {result.parseResult.parseErrors.length > 0 && (
            <ul className="space-y-0.5">
              {result.parseResult.parseErrors.map((e, i) => (
                <li key={i} className="text-xs text-yellow-500">⚠ {e}</li>
              ))}
            </ul>
          )}

          {/* Medium-confidence warnings */}
          {result.parseResult.parseWarnings.length > 0 && (
            <ul className="space-y-0.5">
              {result.parseResult.parseWarnings.map((w, i) => (
                <li key={i} className="text-xs text-orange-400">⚡ {w}</li>
              ))}
            </ul>
          )}

          {/* Clarification block — inline, co-located with the stage that raised it */}
          {result.parseResult.clarificationMessage && (
            <div className="border-t border-amber-800 pt-3 space-y-1">
              <p className="text-xs font-semibold text-amber-400">Clarification needed</p>
              <p className="text-sm text-amber-200">{result.parseResult.clarificationMessage}</p>
              <p className="text-xs text-amber-600">
                This instruction was not forwarded to the policy engine or execution layer.
                Revise and resubmit.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── Stage 2: Context Engine ───────────────────────────────────────────── */}
      {result && (() => {
        const ctx = result.context as ContextSnapshot | null;
        const isBlocked = result.stage === "PARSE_BLOCKED";
        const isTransfer = result.action.actionType === "HBAR_TRANSFER";

        // Allowlist evaluation — only meaningful for transfers with a context
        const recipientId = result.action.recipientId;
        type AllowlistStatus = "approved" | "not on list" | "not extracted" | "not enforced" | "n/a";
        let allowlistStatus: AllowlistStatus = "n/a";
        let allowlistOk = true;
        if (ctx && isTransfer) {
          if (!ctx.enforceRecipientAllowlist) {
            allowlistStatus = "not enforced";
          } else if (!recipientId) {
            allowlistStatus = "not extracted";
            allowlistOk = false;
          } else if (ctx.approvedRecipients.includes(recipientId)) {
            allowlistStatus = "approved";
          } else {
            allowlistStatus = "not on list";
            allowlistOk = false;
          }
        }

        const treasuryClass = !ctx ? "text-gray-600" :
          ctx.treasuryPosture === "NORMAL"      ? "text-green-400" :
          ctx.treasuryPosture === "RESTRICTED"  ? "text-yellow-400" :
                                                  "text-red-400";

        return (
          <section className="border border-teal-900 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono select-none">STAGE 2</span>
              <span className="text-sm font-bold text-teal-300">Context Engine</span>
              {isBlocked ? (
                <span className="ml-auto text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-500 font-mono">
                  NOT LOADED
                </span>
              ) : (
                <span className="ml-auto text-xs px-2 py-0.5 rounded bg-teal-950 text-teal-400 font-mono">
                  LOADED
                </span>
              )}
            </div>

            {isBlocked ? (
              <p className="text-xs font-mono text-gray-600">
                Context not loaded — instruction was blocked before the pipeline.
              </p>
            ) : ctx && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                <span className="text-gray-500">Actor</span>
                <span className="text-gray-200">{ctx.actorId}</span>

                <span className="text-gray-500">Role</span>
                <span className="text-gray-200">{ctx.actorRole}</span>

                <span className="text-gray-500">Partner</span>
                <span className="text-gray-200">{ctx.partnerId}</span>

                <span className="text-gray-500">Treasury</span>
                <span className={treasuryClass}>{ctx.treasuryPosture}</span>

                {isTransfer && (
                  <>
                    <span className="text-gray-500">Transfer limit</span>
                    <span className="text-gray-200">{ctx.amountThresholdHbar} HBAR</span>

                    <span className="text-gray-500">Recipient</span>
                    <span className={recipientId ? "text-gray-200" : "text-gray-600"}>
                      {recipientId || "not extracted"}
                    </span>

                    <span className="text-gray-500">Allowlist</span>
                    <span className={allowlistOk ? "text-green-400" : "text-red-400"}>
                      {allowlistStatus}
                    </span>
                  </>
                )}
              </div>
            )}
          </section>
        );
      })()}

      {/* ── Stage 3: Clearing Agent (Policy) + Execution ─────────────────────── */}
      {result && (() => {
        const isBlocked = result.stage === "PARSE_BLOCKED";
        const decision = result.policyResult?.decision;
        const pr = result.policyResult;

        // Execution status label and colour
        type ExecStatus = "executed" | "not executed" | "not reached";
        let execStatus: ExecStatus;
        let execClass: string;
        if (isBlocked) {
          execStatus = "not reached";
          execClass = "text-gray-600";
        } else if (result.txId || result.balanceHbar !== null) {
          execStatus = "executed";
          execClass = "text-green-400";
        } else {
          execStatus = "not executed";
          execClass = "text-gray-500";
        }

        const rules = pr?.evaluatedRules ?? [];

        return (
          <section className="border border-gray-700 rounded-lg p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono select-none">STAGE 3</span>
              <span className="text-sm font-bold text-gray-200">Clearing Agent &amp; Execution</span>
              {badge && !isBlocked && (
                <span className={`ml-auto text-xs px-2 py-0.5 rounded font-mono font-bold ${badge.className}`}>
                  {badge.label}
                </span>
              )}
              {isBlocked && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-500 font-mono">
                  SKIPPED
                </span>
              )}
            </div>

            {/* Evidence grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">

              {/* Policy decision row */}
              <span className="text-gray-500">Decision</span>
              {isBlocked ? (
                <span className="text-gray-600">not evaluated</span>
              ) : (
                <span className={
                  decision === "APPROVED"          ? "text-green-400"  :
                  decision === "DENIED"            ? "text-red-400"    :
                  decision === "APPROVAL_REQUIRED" ? "text-yellow-400" :
                  decision === "MANUAL_REVIEW"     ? "text-orange-400" :
                                                     "text-gray-400"
                }>
                  {decision ?? "—"}
                </span>
              )}

              {/* Denial reason — structured code */}
              {!isBlocked && pr?.denialReason && (
                <>
                  <span className="text-gray-500">Reason</span>
                  <span className="text-red-300">{pr.denialReason}</span>
                </>
              )}

              {/* Denial detail — human explanation, only for non-approved policy outcomes */}
              {!isBlocked && pr?.denialDetail && decision !== "APPROVED" && (
                <>
                  <span className="text-gray-500">Explanation</span>
                  <span className="text-gray-400 whitespace-normal">{pr.denialDetail}</span>
                </>
              )}

              {/* Parse-blocked clarification — from the Intent Agent, not a policy denial */}
              {isBlocked && result.error && (
                <>
                  <span className="text-gray-500">Clarification</span>
                  <span className="text-amber-400 whitespace-normal">{result.error}</span>
                </>
              )}

              {/* Execution status */}
              <span className="text-gray-500">Execution</span>
              <span className={execClass}>{execStatus}</span>

              {/* Approved transfer — tx link */}
              {result.txId && (
                <>
                  <span className="text-gray-500">Tx</span>
                  <a
                    href={`${hashscanBase}/${result.txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline break-all"
                  >
                    {result.txId}
                  </a>
                </>
              )}

              {/* Balance check result */}
              {result.balanceHbar !== null && (
                <>
                  <span className="text-gray-500">Balance</span>
                  <span className="text-green-300 font-semibold">{result.balanceHbar} HBAR</span>
                </>
              )}
            </div>

            {/* Evaluated rules — collapsible, only when rules were actually run */}
            {rules.length > 0 && (
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer hover:text-gray-400 select-none">
                  Rules evaluated ({rules.length})
                </summary>
                <ul className="mt-1 ml-4 space-y-0.5 list-disc">
                  {rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })()}

      {/* ── Stage 4: Evidence Layer ───────────────────────────────────────────── */}
      <section className="border border-violet-900 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono select-none">STAGE 4</span>
          <span className="text-sm font-bold text-violet-300">Evidence Layer</span>
          <span className="text-xs text-gray-500 font-mono">· Hedera Consensus Service</span>
        </div>

        {/* Per-submission audit summary — only shown after a run */}
        {result && (() => {
          const isBlocked = result.stage === "PARSE_BLOCKED";
          const decision = result.policyResult?.decision;
          const auditWritten = !!result.hcsTopicId && result.hcsSequenceNumber >= 0;
          // A non-fatal HCS failure: pipeline ran past policy but topic is still empty
          // Non-fatal HCS failure: pipeline reached the audit step but the write
          // failed. PARSE_BLOCKED and POLICY_EVALUATED never attempt an audit write.
          const auditFailed = !auditWritten &&
            result.stage !== "PARSE_BLOCKED" &&
            result.stage !== "POLICY_EVALUATED" &&
            result.stage !== "ERROR";

          const displayOutcome = isBlocked ? "PARSE_BLOCKED" : (decision ?? "—");
          const outcomeClass =
            displayOutcome === "APPROVED"          ? "text-green-400"  :
            displayOutcome === "DENIED"            ? "text-red-400"    :
            displayOutcome === "APPROVAL_REQUIRED" ? "text-yellow-400" :
            displayOutcome === "MANUAL_REVIEW"     ? "text-orange-400" :
            displayOutcome === "PARSE_BLOCKED"     ? "text-amber-400"  :
                                                     "text-gray-400";

          return (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
              {/* Outcome first — anchors the grid */}
              <span className="text-gray-500">Outcome</span>
              <span className={outcomeClass}>{displayOutcome}</span>

              <span className="text-gray-500">Audit written</span>
              <span className={auditWritten ? "text-green-400" : auditFailed ? "text-yellow-500" : "text-gray-600"}>
                {auditWritten ? "yes" : auditFailed ? "failed (non-fatal)" : "no"}
              </span>

              {result.hcsTopicId && (
                <>
                  <span className="text-gray-500">Topic</span>
                  <span className="text-gray-300">{result.hcsTopicId}</span>

                  <span className="text-gray-500">Sequence</span>
                  <span className="text-gray-300">#{result.hcsSequenceNumber}</span>
                </>
              )}

              {result.txId && (
                <>
                  <span className="text-gray-500">Tx</span>
                  <a
                    href={`${hashscanBase}/${result.txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline break-all"
                  >
                    {result.txId}
                  </a>
                </>
              )}
            </div>
          );
        })()}

        {/* On-chain replay history */}
        <details open={auditLog.length > 0}>
          <summary className="cursor-pointer flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 list-none select-none">
            <span className="font-mono transition-transform [[open]_&]:rotate-90">▶</span>
            <span className="font-semibold">On-chain replay history</span>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); handleReplay(); }}
              disabled={replayLoading}
              className="ml-2 px-2 py-0.5 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 disabled:opacity-50 text-xs"
            >
              {replayLoading ? "Loading…" : "Refresh"}
            </button>
          </summary>

          <div className="mt-3 space-y-2">
            {auditConfigured === null ? (
              <p className="text-xs text-gray-600">Click Refresh to load the on-chain audit history.</p>
            ) : !auditConfigured ? (
              <p className="text-xs text-yellow-600">
                HCS_TOPIC_ID not configured — run{" "}
                <code className="bg-gray-800 px-1 rounded">npm run create-topic</code>{" "}
                then set the ID in <code className="bg-gray-800 px-1 rounded">.env</code>.
              </p>
            ) : auditLog.length === 0 ? (
              <p className="text-xs text-gray-600">No audit events found yet on this topic.</p>
            ) : auditLog.map((msg) => {
              const ac = msg.agentContext;
              // A PARSE_BLOCKED event has: decision=DENIED, denialReason=null,
              // evaluatedRules=[], and agentContext present with low confidence.
              const isParseBlocked =
                msg.policyResult.decision === "DENIED" &&
                msg.policyResult.denialReason === null &&
                msg.policyResult.evaluatedRules.length === 0 &&
                !!ac;
              const displayDecision = isParseBlocked ? "PARSE_BLOCKED" : msg.policyResult.decision;
              const decisionClass =
                displayDecision === "APPROVED"          ? "text-green-400"  :
                displayDecision === "DENIED"            ? "text-red-400"    :
                displayDecision === "APPROVAL_REQUIRED" ? "text-yellow-400" :
                displayDecision === "MANUAL_REVIEW"     ? "text-orange-400" :
                displayDecision === "PARSE_BLOCKED"     ? "text-amber-400"  :
                                                          "text-gray-400";
              const b = isParseBlocked
                ? { label: "PARSE BLOCKED", className: "bg-amber-900 text-amber-300" }
                : getBadge(msg.policyResult.decision);

              return (
                <div
                  key={msg.correlationId}
                  className="border border-gray-800 rounded p-3 text-xs space-y-2"
                >
                  {/* Meta row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded font-bold ${b.className}`}>
                      {b.label}
                    </span>
                    <span className="text-gray-600">#{msg.sequenceNumber}</span>
                    <span className="text-gray-600">{new Date(msg.timestamp).toLocaleString()}</span>
                    {ac && (
                      <>
                        <span className="text-gray-700">·</span>
                        <span className="text-indigo-500">{ac.parserMode}</span>
                        <span className={
                          ac.confidence >= 0.8 ? "text-green-600" :
                          ac.confidence >= 0.5 ? "text-yellow-600" :
                                                 "text-red-600"
                        }>{Math.round(ac.confidence * 100)}%</span>
                      </>
                    )}
                  </div>

                  {/* Evidence grid */}
                  <div className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-0.5 font-mono">
                    <span className="text-gray-600">Instruction</span>
                    <span className="text-gray-300 break-all">{msg.action.rawInstruction}</span>

                    <span className="text-gray-600">Intent</span>
                    <span className="text-gray-300">{msg.action.actionType}</span>

                    {msg.action.actionType === "HBAR_TRANSFER" && (
                      <>
                        <span className="text-gray-600">Amount</span>
                        <span className="text-gray-300">
                          {msg.action.amountHbar > 0 ? `${msg.action.amountHbar} HBAR` : "—"}
                        </span>
                        <span className="text-gray-600">Recipient</span>
                        <span className="text-gray-300">{msg.action.recipientId || "—"}</span>
                      </>
                    )}

                    <span className="text-gray-600">Decision</span>
                    <span className={decisionClass}>{displayDecision}</span>

                    {!isParseBlocked && msg.policyResult.denialReason && (
                      <>
                        <span className="text-gray-600">Reason</span>
                        <span className="text-red-400">{msg.policyResult.denialReason}</span>
                      </>
                    )}

                    {isParseBlocked && msg.policyResult.denialDetail && (
                      <>
                        <span className="text-gray-600">Clarification</span>
                        <span className="text-amber-400 whitespace-normal">{msg.policyResult.denialDetail}</span>
                      </>
                    )}

                    {msg.txId && (
                      <>
                        <span className="text-gray-600">Tx</span>
                        <a
                          href={`${hashscanBase}/${msg.txId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline break-all"
                        >
                          {msg.txId}
                        </a>
                      </>
                    )}
                  </div>

                  {ac?.parseWarnings && ac.parseWarnings.length > 0 && (
                    <ul className="space-y-0.5 pt-1 border-t border-gray-800">
                      {ac.parseWarnings.map((w, i) => (
                        <li key={i} className="text-orange-500">⚡ {w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      </section>
    </main>
  );
}
