"use client";

import { useCallback, useEffect, useState } from "react";
import { getAudit, submitIntent } from "./lib/api";
import { Header } from "./components/Header";
import { IntentInput } from "./components/IntentInput";
import { PipelineView } from "./components/PipelineView";
import { PolicyList } from "./components/PolicyList";
import { ResultCard } from "./components/ResultCard";
import { AuditTrail } from "./components/AuditTrail";
import type { Actor, AuditRecord, IntentResponse, Policy, PipelineStages } from "./lib/types";

// Hard-coded from scripts/context_store.json — no /api/actors endpoint exists
const ACTORS: Actor[] = [
  {
    id: "0.0.100",
    role: "OPERATOR",
    amount_threshold_hbar: 100,
    approved_recipients: ["0.0.800", "0.0.801"],
    enforce_recipient_allowlist: true,
  },
  {
    id: "0.0.200",
    role: "PARTNER",
    amount_threshold_hbar: 25,
    approved_recipients: ["0.0.800"],
    enforce_recipient_allowlist: true,
  },
  {
    id: "0.0.300",
    role: "ADMIN",
    amount_threshold_hbar: 500,
    approved_recipients: [],
    enforce_recipient_allowlist: false,
  },
];

// Hard-coded policies — no /api/policies endpoint exists
const POLICIES: Policy[] = [
  { id: "ACTOR_AUTHORISED",    description: "Actor must be registered in the context store." },
  { id: "TREASURY_POSTURE",    description: "Treasury must not be frozen or restricted." },
  { id: "RECIPIENT_ALLOWLIST", description: "Recipient must be on the actor's approved list (when enforced)." },
  { id: "AMOUNT_THRESHOLD",    description: "Transfer amount must not exceed the actor's per-transaction HBAR limit." },
];

const IDLE_PIPELINE: PipelineStages = {
  intent: "idle", context: "idle", policy: "idle", execution: "idle", evidence: "idle",
};

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function Home() {
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [result, setResult] = useState<IntentResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineStages>(IDLE_PIPELINE);
  const [latestId, setLatestId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAudit()
      .then(d => setAuditRecords([...d.records].reverse()))
      .catch(() => {});
  }, []);

  const refreshAudit = useCallback(async () => {
    try {
      const data = await getAudit();
      setAuditRecords([...data.records].reverse());
    } catch {
      // silently ignore
    }
  }, []);

  const handleSubmit = useCallback(async (text: string, actorId: string) => {
    setSubmitting(true);
    setResult(null);
    setError(null);
    setPipeline(IDLE_PIPELINE);

    setPipeline(p => ({ ...p, intent: "active" }));
    const apiPromise = submitIntent(text, actorId);

    await delay(350);
    setPipeline(p => ({ ...p, intent: "complete", context: "active" }));

    await delay(350);
    setPipeline(p => ({ ...p, context: "complete", policy: "active" }));

    let response: IntentResponse;
    try {
      response = await Promise.race([
        apiPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out after 15s")), 15000)
        ),
      ]);
    } catch (err) {
      setPipeline(IDLE_PIPELINE);
      setError(err instanceof Error ? err.message : "Request failed");
      setSubmitting(false);
      return;
    }

    await delay(300);
    setPipeline(p => ({ ...p, policy: "complete" }));

    const approved = response.decision.verdict === "approved";
    await delay(200);

    if (approved) {
      setPipeline(p => ({ ...p, execution: "active" }));
      await delay(350);
      setPipeline(p => ({ ...p, execution: "complete", evidence: "active" }));
    } else {
      setPipeline(p => ({ ...p, execution: "skipped", evidence: "active" }));
    }

    await delay(350);
    setPipeline(p => ({ ...p, evidence: "complete" }));

    setResult(response);
    setLatestId(response.intent_id);
    await refreshAudit();
    setSubmitting(false);
  }, [refreshAudit]);

  const handleReset = useCallback(() => {
    setResult(null);
    setLatestId(undefined);
    setPipeline(IDLE_PIPELINE);
    setError(null);
    setAuditRecords([]);
  }, []);

  const handleReplay = useCallback(async () => {
    await refreshAudit();
  }, [refreshAudit]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <Header onReset={handleReset} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left sidebar: policies + actors */}
        <aside
          style={{
            width: "260px",
            flexShrink: 0,
            background: "var(--surface)",
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <PolicyList policies={POLICIES} actors={ACTORS} />
        </aside>

        {/* Center main */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            minWidth: 0,
          }}
        >
          <IntentInput actors={ACTORS} onSubmit={handleSubmit} submitting={submitting} />
          <PipelineView stages={pipeline} />

          {error && (
            <div
              style={{
                background: "rgba(233,69,96,0.1)",
                border: "1px solid rgba(233,69,96,0.4)",
                borderRadius: "6px",
                padding: "12px 16px",
                fontFamily: "var(--font-body)",
                fontSize: "13px",
                color: "#e94560",
              }}
            >
              {error}
            </div>
          )}

          {result && <ResultCard result={result} />}

          {!result && !submitting && !error && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "32px 40px",
                gap: "24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  opacity: 0.45,
                }}
              >
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <path
                    d="M20 3L4 9.5V18C4 27.6 11 36.4 20 38.5C29 36.4 36 27.6 36 18V9.5L20 3Z"
                    stroke="var(--muted)"
                    strokeWidth="1.25"
                    fill="oklch(0.60 0.020 240 / 0.06)"
                  />
                  <path d="M14 20l4 4L26 16" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--muted)",
                  }}
                >
                  Awaiting intent
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "12px",
                  width: "100%",
                  maxWidth: "480px",
                }}
              >
                {[
                  { num: "01", title: "Select actor", desc: "Choose which operator submits the intent and inherits their policy limits." },
                  { num: "02", title: "Enter intent",  desc: "Type a natural-language payout or treasury instruction, or load a demo beat." },
                  { num: "03", title: "Watch clearance", desc: "Each stage lights up as it runs. The verdict and HCS audit entry appear instantly." },
                ].map(step => (
                  <div
                    key={step.num}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "5px",
                      padding: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "var(--faint)",
                        letterSpacing: "0.1em",
                        marginBottom: "6px",
                      }}
                    >
                      {step.num}
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>
                      {step.title}
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: "11px", color: "var(--muted)", lineHeight: "1.5" }}>
                      {step.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Right panel: audit trail */}
        <aside
          style={{
            width: "320px",
            flexShrink: 0,
            background: "var(--surface)",
            borderLeft: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <AuditTrail
            records={auditRecords}
            onReplay={handleReplay}
            replaying={false}
            latestId={latestId}
          />
        </aside>
      </div>
    </div>
  );
}
