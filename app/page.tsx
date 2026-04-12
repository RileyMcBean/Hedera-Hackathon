"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PipelineResult } from "../src/runtime/pipeline";
import type { AuditMessage } from "../src/schemas/audit";

// ── Constants ──────────────────────────────────────────────────────────────────

const TREASURY_ID = "0.0.8569873";
const HCS_TOPIC_ID = "0.0.8597763";
const NTFY_TOPIC = "sika-sentinel-approvals";

const DEMO_ACTORS = [
  { id: "0.0.100", role: "Operator", limit: "100 HBAR", description: "Standard partner operations" },
  { id: "0.0.200", role: "Partner", limit: "25 HBAR", description: "Restricted external transfers" },
  { id: "0.0.300", role: "Admin", limit: "500 HBAR", description: "Open access — no allowlist" },
];

const RECIPIENT_IDS = ["0.0.8597846", "0.0.8596004"];

const DEMO_INSTRUCTIONS = [
  `Send 5 HBAR to ${RECIPIENT_IDS[0]}`,
  `Transfer 10 HBAR to ${RECIPIENT_IDS[1]}`,
  `Pay 150 HBAR to ${RECIPIENT_IDS[0]}`,
];

// ── Types ──────────────────────────────────────────────────────────────────────

type RunResult = PipelineResult & { approvalId?: string };

interface PendingApprovalDTO {
  id: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  action: { rawInstruction: string; actorId: string; recipientId: string; amountHbar: number };
  policyResult: { decision: string; denialReason: string | null; denialDetail: string };
  txId: string;
  hcsTopicId: string;
  hcsSequenceNumber: number;
  resolvedAt: string;
}

type Decision = "APPROVED" | "DENIED" | "APPROVAL_REQUIRED" | "MANUAL_REVIEW";

// ── Design tokens ──────────────────────────────────────────────────────────────

const DECISION_CONFIG: Record<
  Decision,
  { label: string; bg: string; border: string; text: string; dot: string }
> = {
  APPROVED: {
    label: "Approved",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  DENIED: {
    label: "Denied",
    bg: "bg-red-500/10",
    border: "border-red-500/25",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  APPROVAL_REQUIRED: {
    label: "Approval Required",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  MANUAL_REVIEW: {
    label: "Manual Review",
    bg: "bg-orange-500/10",
    border: "border-orange-500/25",
    text: "text-orange-400",
    dot: "bg-orange-400",
  },
};

// ── Components ─────────────────────────────────────────────────────────────────

function DecisionChip({ decision }: { decision: string }) {
  const cfg = DECISION_CONFIG[decision as Decision] ?? {
    label: decision,
    bg: "bg-gray-800",
    border: "border-gray-700",
    text: "text-gray-300",
    dot: "bg-gray-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.border} ${cfg.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block border-2 border-current border-t-transparent rounded-full animate-spin ${className}`}
      aria-hidden="true"
    />
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Home() {
  const [instruction, setInstruction] = useState("");
  const [actorId, setActorId] = useState(DEMO_ACTORS[0].id);
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);

  // Pending approval
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalDTO | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const approvalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audit log
  const [auditLog, setAuditLog] = useState<AuditMessage[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditOpen, setAuditOpen] = useState(true);
  /** Optimistic entries — shown immediately, removed once HCS confirms them */
  const [optimisticEntries, setOptimisticEntries] = useState<AuditMessage[]>([]);
  const auditRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Audit ────────────────────────────────────────────────────────────────────

  const fetchAudit = useCallback(async (silent = false) => {
    if (!silent) setAuditLoading(true);
    try {
      const res = await fetch("/api/audit/replay");
      const data = await res.json();
      if (!res.ok) return;
      const messages: AuditMessage[] = (data.messages ?? []).slice().reverse();
      setAuditLog(messages);
      // Drop optimistic entries that HCS has now confirmed
      const confirmedIds = new Set(messages.map((m) => m.correlationId));
      setOptimisticEntries((prev) => prev.filter((e) => !confirmedIds.has(e.correlationId)));
    } finally {
      if (!silent) setAuditLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  // Schedule a delayed refresh after a submission (Mirror Node propagation delay)
  const scheduleAuditRefresh = useCallback(() => {
    if (auditRefreshTimerRef.current) clearTimeout(auditRefreshTimerRef.current);
    auditRefreshTimerRef.current = setTimeout(() => fetchAudit(true), 7000);
  }, [fetchAudit]);

  useEffect(() => () => {
    if (auditRefreshTimerRef.current) clearTimeout(auditRefreshTimerRef.current);
  }, []);

  // ── Approval polling ─────────────────────────────────────────────────────────

  const stopApprovalPoll = useCallback(() => {
    if (approvalPollRef.current) {
      clearInterval(approvalPollRef.current);
      approvalPollRef.current = null;
    }
  }, []);

  const pollApproval = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/approvals/${id}`);
        if (!res.ok) return;
        const data: PendingApprovalDTO = await res.json();
        setPendingApproval(data);

        if (data.status !== "PENDING") {
          stopApprovalPoll();
          // If the phone-approved transfer was executed, add it to the audit log optimistically
          // and schedule a real HCS refresh
          scheduleAuditRefresh();
        }
      } catch {
        // silent — non-critical
      }
    },
    [stopApprovalPoll, scheduleAuditRefresh]
  );

  const startApprovalPoll = useCallback(
    (id: string) => {
      stopApprovalPoll();
      // Poll immediately, then every 3 seconds
      pollApproval(id);
      approvalPollRef.current = setInterval(() => pollApproval(id), 3000);
    },
    [pollApproval, stopApprovalPoll]
  );

  useEffect(() => () => stopApprovalPoll(), [stopApprovalPoll]);

  // ── Submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instruction.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setRulesOpen(false);
    setPendingApproval(null);
    stopApprovalPoll();

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, actorId }),
      });
      const data: RunResult = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
      setResult(data);

      // Optimistically prepend this decision to the audit log
      if (data.policyResult) {
        const synthetic: AuditMessage = {
          correlationId: data.action.correlationId,
          timestamp: data.timestamp,
          action: data.action,
          policyResult: data.policyResult,
          txId: data.txId,
          topicId: data.hcsTopicId,
          sequenceNumber: data.hcsSequenceNumber,
        };
        setOptimisticEntries((prev) => [
          synthetic,
          ...prev.filter((e) => e.correlationId !== synthetic.correlationId),
        ]);
      }

      // If APPROVAL_REQUIRED, start polling the approval endpoint
      if (data.policyResult?.decision === "APPROVAL_REQUIRED" && data.approvalId) {
        // Show the initial PENDING state immediately
        setPendingApproval({
          id: data.approvalId,
          status: "PENDING",
          action: data.action,
          policyResult: data.policyResult,
          txId: "",
          hcsTopicId: "",
          hcsSequenceNumber: -1,
          resolvedAt: "",
        });
        startApprovalPoll(data.approvalId);
      } else {
        scheduleAuditRefresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Manual approve / deny (UI fallback) ──────────────────────────────────────

  async function handleManualApprove() {
    if (!pendingApproval) return;
    setApprovalLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/approvals/${pendingApproval.id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Approve failed (${res.status})`);
      setPendingApproval(data as PendingApprovalDTO);
      stopApprovalPoll();
      scheduleAuditRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApprovalLoading(false);
    }
  }

  async function handleManualDeny() {
    if (!pendingApproval) return;
    setApprovalLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/approvals/${pendingApproval.id}/deny`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Deny failed (${res.status})`);
      setPendingApproval(data as PendingApprovalDTO);
      stopApprovalPoll();
      scheduleAuditRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApprovalLoading(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const hashscanBase = "https://hashscan.io/testnet/transaction";
  const selectedActor = DEMO_ACTORS.find((a) => a.id === actorId)!;
  const isApprovalPending = pendingApproval?.status === "PENDING";
  const isApprovalResolved =
    pendingApproval?.status === "APPROVED" || pendingApproval?.status === "DENIED";

  // Merged audit display: optimistic entries first, then HCS-confirmed entries
  const confirmedIds = new Set(auditLog.map((m) => m.correlationId));
  const displayedAuditLog = [
    ...optimisticEntries.filter((e) => !confirmedIds.has(e.correlationId)),
    ...auditLog,
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-xs font-bold text-white select-none"
              aria-hidden="true"
            >
              S
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">Sika Sentinel</p>
              <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">
                Runtime governance for Hedera
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="hidden md:flex items-center gap-1.5 text-gray-500">
              Treasury
              <span className="font-mono text-gray-300 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">
                {TREASURY_ID}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" aria-hidden="true" />
              testnet
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* ── Two-column: form + decision / approval ──────────── */}
        <div className="grid lg:grid-cols-2 gap-6 items-start">

          {/* Submit form */}
          <section
            aria-labelledby="submit-heading"
            className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-6"
          >
            <div>
              <h2 id="submit-heading" className="text-base font-semibold text-white">
                Submit Instruction
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Dispatch a payout through the policy engine
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Role selector */}
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Authorising Role
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {DEMO_ACTORS.map((actor) => {
                    const isSelected = actorId === actor.id;
                    return (
                      <button
                        key={actor.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setActorId(actor.id)}
                        className={`flex flex-col items-center py-3 px-2 rounded-xl border text-center transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/40
                          ${
                            isSelected
                              ? "bg-blue-600/15 border-blue-500/50 text-white"
                              : "bg-gray-800/40 border-gray-700/40 text-gray-400 hover:border-gray-600 hover:text-gray-200 hover:bg-gray-800/60"
                          }`}
                      >
                        <span className="text-sm font-semibold">{actor.role}</span>
                        <span className="text-xs opacity-60 mt-0.5">{actor.limit}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-600 pt-0.5">{selectedActor.description}</p>
              </fieldset>

              {/* From / Treasury */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block">
                  From
                </label>
                <div className="flex items-center justify-between gap-2 bg-gray-800/30 border border-gray-700/40 rounded-xl px-4 py-2.5">
                  <span className="font-mono text-sm text-gray-300 select-all">{TREASURY_ID}</span>
                  <span className="text-xs text-gray-600 shrink-0">fixed treasury</span>
                </div>
              </div>

              {/* Instruction */}
              <div className="space-y-1.5">
                <label
                  htmlFor="instruction-input"
                  className="text-xs font-medium text-gray-400 uppercase tracking-wider block"
                >
                  Instruction
                </label>
                <textarea
                  id="instruction-input"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={3}
                  placeholder={`e.g. Send 5 HBAR to ${RECIPIENT_IDS[0]}`}
                  className="w-full bg-gray-800/30 border border-gray-700/40 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                />
              </div>

              {/* Quick actions */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Quick actions
                </p>
                <div className="flex flex-wrap gap-2">
                  {DEMO_INSTRUCTIONS.map((instr) => (
                    <button
                      key={instr}
                      type="button"
                      onClick={() => setInstruction(instr)}
                      className="text-xs px-3 py-1.5 bg-gray-800/60 border border-gray-700/40 rounded-lg hover:bg-gray-700/60 hover:border-gray-600/60 text-gray-400 hover:text-gray-200 transition-colors font-mono focus:outline-none focus:ring-2 focus:ring-gray-600/40"
                    >
                      {instr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
                >
                  <span className="shrink-0 font-bold" aria-hidden="true">×</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !instruction.trim()}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner className="w-3.5 h-3.5 opacity-70" />
                    Processing...
                  </span>
                ) : (
                  "Submit"
                )}
              </button>
            </form>
          </section>

          {/* Right column: Decision or Approval panel */}
          <div className="space-y-4">

            {/* Policy Decision */}
            <section
              aria-labelledby="decision-heading"
              aria-live="polite"
              className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col"
            >
              <h2 id="decision-heading" className="text-base font-semibold text-white mb-5">
                Policy Decision
              </h2>

              {!result ? (
                <div className="flex flex-col items-center justify-center text-center py-10 space-y-3">
                  <div
                    className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700/50 flex items-center justify-center"
                    aria-hidden="true"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-600">Submit an instruction to see the policy decision</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {result.policyResult && (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <DecisionChip decision={result.policyResult.decision} />
                        <span className="text-xs text-gray-600">
                          {new Date(result.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      {(result.policyResult.denialReason || result.policyResult.denialDetail) && (
                        <div className="bg-gray-800/50 border border-gray-700/40 rounded-xl p-4 space-y-1.5">
                          {result.policyResult.denialReason && (
                            <>
                              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Reason</p>
                              <p className="text-sm text-gray-200">{result.policyResult.denialReason}</p>
                            </>
                          )}
                          {result.policyResult.denialDetail && (
                            <p className="text-xs text-gray-500 pt-0.5">{result.policyResult.denialDetail}</p>
                          )}
                        </div>
                      )}

                      {/* Resolved approval — show transaction details */}
                      {isApprovalResolved && pendingApproval?.txId && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Transaction</p>
                          <a
                            href={`${hashscanBase}/${pendingApproval.txId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-1.5 text-xs font-mono text-blue-400 hover:text-blue-300 break-all transition-colors"
                          >
                            <span className="break-all">{pendingApproval.txId}</span>
                            <span className="shrink-0 text-blue-500/60 mt-0.5" aria-hidden="true">↗</span>
                          </a>
                        </div>
                      )}

                      {/* Normal APPROVED transaction */}
                      {!pendingApproval && result.txId && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Transaction</p>
                          <a
                            href={`${hashscanBase}/${result.txId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-1.5 text-xs font-mono text-blue-400 hover:text-blue-300 break-all transition-colors"
                          >
                            <span className="break-all">{result.txId}</span>
                            <span className="shrink-0 text-blue-500/60 mt-0.5" aria-hidden="true">↗</span>
                          </a>
                        </div>
                      )}

                      {result.hcsTopicId && (
                        <div className="flex items-center gap-2 bg-gray-800/30 border border-gray-700/30 rounded-xl px-4 py-2.5 text-xs">
                          <span className="text-gray-500">HCS audit</span>
                          <span className="text-gray-700" aria-hidden="true">·</span>
                          <span className="font-mono text-gray-300">#{result.hcsSequenceNumber}</span>
                          <span className="text-gray-700" aria-hidden="true">·</span>
                          <span className="font-mono text-gray-500">{result.hcsTopicId}</span>
                        </div>
                      )}

                      <div className="border-t border-gray-800 pt-4">
                        <button
                          onClick={() => setRulesOpen((o) => !o)}
                          aria-expanded={rulesOpen}
                          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors focus:outline-none focus:text-gray-300"
                        >
                          <svg
                            className={`w-3 h-3 transition-transform ${rulesOpen ? "rotate-90" : ""}`}
                            viewBox="0 0 6 10"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M1 1l4 4-4 4" />
                          </svg>
                          Rules evaluated ({result.policyResult.evaluatedRules.length})
                        </button>
                        {rulesOpen && (
                          <ul className="mt-3 space-y-1.5" aria-label="Evaluated rules">
                            {result.policyResult.evaluatedRules.map((r) => (
                              <li key={r} className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="w-1 h-1 rounded-full bg-gray-700 shrink-0" aria-hidden="true" />
                                {r}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>

            {/* Approval panel — visible when a decision requires manual sign-off */}
            {pendingApproval && (
              <section
                aria-labelledby="approval-heading"
                aria-live="polite"
                className={`border rounded-2xl p-6 space-y-4 transition-colors ${
                  isApprovalPending
                    ? "bg-amber-500/5 border-amber-500/20"
                    : pendingApproval.status === "APPROVED"
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-red-500/5 border-red-500/20"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 id="approval-heading" className="text-sm font-semibold text-white">
                    {isApprovalPending
                      ? "Awaiting Approval"
                      : pendingApproval.status === "APPROVED"
                      ? "Approved by account holder"
                      : "Declined by account holder"}
                  </h3>
                  {isApprovalPending && (
                    <span className="flex items-center gap-1.5 text-xs text-amber-400">
                      <Spinner className="w-3 h-3" />
                      Waiting...
                    </span>
                  )}
                  {isApprovalResolved && (
                    <DecisionChip decision={pendingApproval.status} />
                  )}
                </div>

                {/* Transaction summary */}
                <div className="bg-black/20 rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-sm text-gray-200 font-mono">
                    {pendingApproval.action.rawInstruction}
                  </p>
                  <p className="text-xs text-gray-500">
                    Actor{" "}
                    <span className="font-mono text-gray-400">{pendingApproval.action.actorId}</span>
                    <span className="mx-1.5 text-gray-700" aria-hidden="true">·</span>
                    Recipient{" "}
                    <span className="font-mono text-gray-400">{pendingApproval.action.recipientId}</span>
                  </p>
                </div>

                {isApprovalPending && (
                  <>
                    {/* Ntfy info */}
                    <div className="flex items-start gap-2.5 bg-black/20 rounded-xl px-4 py-3">
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-gray-300">
                          Notification sent to your phone
                        </p>
                        <p className="text-xs text-gray-500">
                          Subscribe to{" "}
                          <span className="font-mono text-amber-400">{NTFY_TOPIC}</span>
                          {" "}in the ntfy app, then tap{" "}
                          <span className="font-semibold text-gray-300">Approve</span> or{" "}
                          <span className="font-semibold text-gray-300">Deny</span>.
                        </p>
                      </div>
                    </div>

                    {/* UI fallback */}
                    <div className="space-y-2">
                      <p className="text-xs text-gray-600">Or decide here:</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleManualApprove}
                          disabled={approvalLoading}
                          className="flex-1 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-600/30 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        >
                          {approvalLoading ? <Spinner className="w-3.5 h-3.5 mx-auto" /> : "Approve"}
                        </button>
                        <button
                          onClick={handleManualDeny}
                          disabled={approvalLoading}
                          className="flex-1 py-2 rounded-xl bg-red-600/20 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-600/30 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
                        >
                          {approvalLoading ? <Spinner className="w-3.5 h-3.5 mx-auto" /> : "Deny"}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Post-resolution HCS reference */}
                {isApprovalResolved && pendingApproval.hcsTopicId && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>HCS audit</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">#{pendingApproval.hcsSequenceNumber}</span>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        {/* ── Audit history (collapsible) ──────────────────────── */}
        <section
          aria-labelledby="audit-heading"
          className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
        >
          {/* Header / toggle */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <button
              onClick={() => setAuditOpen((o) => !o)}
              aria-expanded={auditOpen}
              aria-controls="audit-log-list"
              className="flex items-center gap-3 text-left focus:outline-none group"
            >
              <svg
                className={`w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-transform ${auditOpen ? "rotate-90" : ""}`}
                viewBox="0 0 6 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M1 1l4 4-4 4" />
              </svg>
              <div>
                <h2 id="audit-heading" className="text-base font-semibold text-white group-hover:text-gray-100 transition-colors">
                  On-Chain Audit History
                  {displayedAuditLog.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      ({displayedAuditLog.length})
                    </span>
                  )}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">topic {HCS_TOPIC_ID}</p>
              </div>
            </button>
            <button
              onClick={() => fetchAudit()}
              disabled={auditLoading}
              aria-label="Refresh audit history"
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-xs text-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-600/40"
            >
              {auditLoading ? (
                <Spinner className="w-3 h-3" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              Refresh
            </button>
          </div>

          {/* Collapsible body */}
          {auditOpen && (
            <div id="audit-log-list">
              {/* Loading skeleton */}
              {auditLoading && displayedAuditLog.length === 0 && (
                <div className="divide-y divide-gray-800/60" aria-busy="true" aria-label="Loading audit history">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="px-6 py-4 animate-pulse space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-5 bg-gray-800 rounded-full" />
                        <div className="w-8 h-4 bg-gray-800 rounded" />
                        <div className="w-28 h-4 bg-gray-800 rounded" />
                      </div>
                      <div className="w-56 h-4 bg-gray-800 rounded" />
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!auditLoading && displayedAuditLog.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 text-center space-y-2">
                  <p className="text-sm text-gray-600">No audit records found on this topic</p>
                  <p className="text-xs text-gray-700">
                    Submitted transactions are recorded to HCS and will appear here
                  </p>
                </div>
              )}

              {/* Entries */}
              {displayedAuditLog.length > 0 && (
                <ol className="divide-y divide-gray-800/60" aria-label="Audit log entries">
                  {displayedAuditLog.map((msg) => {
                    const isOptimistic = msg.sequenceNumber === -1;
                    return (
                      <li
                        key={msg.correlationId}
                        className={`px-6 py-4 transition-colors ${
                          isOptimistic
                            ? "bg-blue-500/5 hover:bg-blue-500/8"
                            : "hover:bg-gray-800/20"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3 flex-wrap min-w-0">
                            <DecisionChip decision={msg.policyResult.decision} />
                            {isOptimistic ? (
                              <span className="flex items-center gap-1 text-xs text-blue-500/60">
                                <Spinner className="w-2.5 h-2.5" />
                                confirming on-chain...
                              </span>
                            ) : (
                              <span className="text-xs font-mono text-gray-600">
                                #{msg.sequenceNumber}
                              </span>
                            )}
                            <time dateTime={msg.timestamp} className="text-xs text-gray-600">
                              {new Date(msg.timestamp).toLocaleString()}
                            </time>
                          </div>
                          {msg.txId && (
                            <a
                              href={`${hashscanBase}/${msg.txId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-xs text-blue-500 hover:text-blue-400 transition-colors focus:outline-none focus:underline"
                            >
                              HashScan ↗
                            </a>
                          )}
                        </div>
                        <p className="text-sm text-gray-300 mt-2 font-mono">
                          {msg.action.rawInstruction}
                        </p>
                        {msg.action.actorId && (
                          <p className="text-xs text-gray-600 mt-1">
                            Actor{" "}
                            <span className="font-mono text-gray-500">{msg.action.actorId}</span>
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
