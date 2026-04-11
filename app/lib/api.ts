import type { AuditRecord, Decision, IntentResponse, StructuredAction } from './types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Raw backend types ─────────────────────────────────────────────────────────

interface RawAction {
  correlationId: string;
  actionType: string;
  actorId: string;
  recipientId: string;
  amountHbar: number;
  rawInstruction: string;
  memo: string;
}

interface RawPolicyResult {
  decision: string;
  denialReason: string | null;
  denialDetail: string;
  evaluatedRules: string[];
}

interface RawPipelineResult {
  action: RawAction;
  policyResult: RawPolicyResult | null;
  stage: string;
  txId: string;
  hcsTopicId: string;
  hcsSequenceNumber: number;
  error: string;
}

interface RawAuditMessage {
  correlationId: string;
  timestamp: string;
  action: RawAction;
  policyResult: RawPolicyResult;
  txId: string;
  topicId: string;
  sequenceNumber: number;
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

function normalizeVerdict(d: string): 'approved' | 'denied' | 'approval_required' | 'manual_review' {
  switch (d) {
    case 'APPROVED':          return 'approved';
    case 'DENIED':            return 'denied';
    case 'APPROVAL_REQUIRED':
    case 'ESCALATED':         return 'approval_required';
    case 'MANUAL_REVIEW':     return 'manual_review';
    default:                  return 'denied';
  }
}

function synthesizeReason(decision: string, denialDetail: string, denialReason: string | null): string {
  if (denialDetail && denialDetail.trim()) return denialDetail;
  if (decision === 'APPROVED') return 'Transfer cleared by all policy rules.';
  if (denialReason) {
    return denialReason
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/^\w/, c => c.toUpperCase());
  }
  return 'Decision recorded.';
}

function mapAction(a: RawAction): StructuredAction {
  return {
    action_type:     a.actionType,
    actor_id:        a.actorId,
    to_account:      a.recipientId,
    amount:          a.amountHbar,
    raw_instruction: a.rawInstruction,
    memo:            a.memo,
  };
}

function mapDecision(pr: RawPolicyResult | null): Decision {
  const decision     = pr?.decision ?? 'DENIED';
  const denialDetail = pr?.denialDetail ?? '';
  const denialReason = pr?.denialReason ?? null;
  return {
    verdict:         normalizeVerdict(decision),
    reason:          synthesizeReason(decision, denialDetail, denialReason),
    denial_reason:   denialReason,
    evaluated_rules: pr?.evaluatedRules ?? [],
  };
}

function mapPipelineResult(raw: RawPipelineResult): IntentResponse {
  return {
    intent_id:          raw.action.correlationId,
    structured_action:  mapAction(raw.action),
    decision:           mapDecision(raw.policyResult),
    execution_result:   raw.txId ? { tx_id: raw.txId, status: 'SUCCESS' } : null,
    hcs_topic_id:       raw.hcsTopicId || undefined,
    hcs_sequence_number: raw.hcsSequenceNumber >= 0 ? raw.hcsSequenceNumber : undefined,
    stage:              raw.stage,
  };
}

function mapAuditMessage(msg: RawAuditMessage): AuditRecord {
  return {
    intent_id:        msg.correlationId,
    timestamp:        msg.timestamp,
    actor_id:         msg.action.actorId,
    action:           mapAction(msg.action),
    decision:         mapDecision(msg.policyResult),
    execution_result: msg.txId ? { tx_id: msg.txId, status: 'SUCCESS' } : null,
    sequence:         msg.sequenceNumber >= 0 ? msg.sequenceNumber : undefined,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function submitIntent(instruction: string, actorId: string): Promise<IntentResponse> {
  const raw = await request<RawPipelineResult>('/api/run', {
    method: 'POST',
    body: JSON.stringify({ instruction, actorId }),
  });
  return mapPipelineResult(raw);
}

export async function getAudit(): Promise<{ records: AuditRecord[] }> {
  const raw = await request<{ messages: RawAuditMessage[] }>('/api/audit/replay');
  return {
    records: (raw.messages ?? []).map(mapAuditMessage),
  };
}
