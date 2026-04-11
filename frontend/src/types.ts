export type Verdict = 'approved' | 'denied' | 'approval_required' | 'manual_review';

// Mapped from backend Action schema
export interface StructuredAction {
  action_type: string;       // e.g. 'HBAR_TRANSFER'
  actor_id: string;          // action.actorId
  to_account: string;        // action.recipientId
  amount: number;            // action.amountHbar
  raw_instruction: string;   // action.rawInstruction
  memo: string;
}

// Normalized from backend policyResult
export interface Decision {
  verdict: Verdict;
  reason: string;             // denialDetail or synthesized approval text
  denial_reason?: string | null;  // raw denialReason enum value
  evaluated_rules: string[];
}

export interface ExecutionResult {
  tx_id: string;
  status: string;
}

// Normalized from backend PipelineResult
export interface IntentResponse {
  intent_id: string;          // action.correlationId
  structured_action: StructuredAction;
  decision: Decision;
  execution_result?: ExecutionResult | null;
  hcs_topic_id?: string;
  hcs_sequence_number?: number;
  stage: string;
}

// Normalized from backend AuditMessage
export interface AuditRecord {
  intent_id: string;          // correlationId
  timestamp: string;
  actor_id: string;           // action.actorId
  action: StructuredAction;
  decision: Decision;
  execution_result?: ExecutionResult | null;
  sequence?: number;
}

// Hard-coded from scripts/context_store.json — no /api/actors endpoint exists
export interface Actor {
  id: string;
  role: string;
  amount_threshold_hbar: number;
  approved_recipients: string[];
  enforce_recipient_allowlist: boolean;
}

// Hard-coded policies — no /api/policies endpoint exists
export interface Policy {
  id: string;
  description: string;
  threshold?: number;
}

export type StageStatus = 'idle' | 'active' | 'complete' | 'skipped';

export interface PipelineStages {
  intent: StageStatus;
  context: StageStatus;
  policy: StageStatus;
  execution: StageStatus;
  evidence: StageStatus;
}
