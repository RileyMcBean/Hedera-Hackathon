export type Verdict = 'approved' | 'denied' | 'approval_required' | 'manual_review';

export interface StructuredAction {
  action_type: string;
  actor_id: string;
  to_account: string;
  amount: number;
  raw_instruction: string;
  memo: string;
}

export interface Decision {
  verdict: Verdict;
  reason: string;
  denial_reason?: string | null;
  evaluated_rules: string[];
}

export interface ExecutionResult {
  tx_id: string;
  status: string;
}

export interface IntentResponse {
  intent_id: string;
  structured_action: StructuredAction;
  decision: Decision;
  execution_result?: ExecutionResult | null;
  hcs_topic_id?: string;
  hcs_sequence_number?: number;
  stage: string;
}

export interface AuditRecord {
  intent_id: string;
  timestamp: string;
  actor_id: string;
  action: StructuredAction;
  decision: Decision;
  execution_result?: ExecutionResult | null;
  sequence?: number;
}

export interface Actor {
  id: string;
  role: string;
  amount_threshold_hbar: number;
  approved_recipients: string[];
  enforce_recipient_allowlist: boolean;
}

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
