# Sika Sentinel — Frontend CLAUDE.md

## What Is This Project?

**Sika Sentinel** is the runtime control, clearing, and evidence layer for SikaHub.
It turns natural-language financial intent into governed execution on Hedera, with a
tamper-evident audit trail for every decision (approvals AND refusals).

**Hackathon:** Agentic Society Hackathon (11–12 April 2026)
**Theme:** AI Agents × the Agentic Economy
**Submission:** 10:00 AM Sunday | Demos: 10:30 AM – 12:00 PM

## The Pipeline

```
Intent → Context → Policy → Execution → Evidence
```

1. Operator submits natural-language payout intent
2. Context engine loads actor role, approved recipients, thresholds
3. Policy engine makes deterministic decision: approved | denied | approval_required | manual_review
4. If approved, executes on Hedera (HBAR transfer, balance query)
5. EVERY decision (approvals AND refusals) written to Hedera Consensus Service audit trail

## Backend API (already built, running at http://localhost:8000)

### POST /api/intent
Submit a natural-language payout or treasury intent.
```json
// Request
{
  "raw_text": "Transfer 50 HBAR to 0.0.456789 for partner payout",
  "actor_id": "operator-001",
  "actor_role": "treasury_admin"
}

// Response
{
  "intent_id": "uuid-here",
  "structured_action": {
    "action_type": "hbar_transfer",
    "from_account": "0.0.123456",
    "to_account": "0.0.456789",
    "amount": 50.0,
    "memo": "partner payout",
    "metadata": {}
  },
  "decision": {
    "verdict": "approved",
    "reason": "Transfer of 50.0 HBAR to 0.0.456789 approved. Within limits, approved recipient.",
    "policy_id": "low-value-auto",
    "risk_score": 0.1,
    "constraints": {}
  },
  "execution_result": {
    "status": "SUCCESS",
    "tx_id": "0.0.mock@1712345678",
    "from": "0.0.123456",
    "to": "0.0.456789",
    "amount": 50.0,
    "mock": true
  },
  "audit_record_sequence": 1
}
```

### GET /api/audit
```json
// Response
{
  "total": 3,
  "records": [
    {
      "intent_id": "uuid",
      "timestamp": "2026-04-11T18:30:00.000Z",
      "actor_id": "operator-001",
      "actor_role": "treasury_admin",
      "action": { "action_type": "balance_query", "amount": null, ... },
      "decision": { "verdict": "approved", "reason": "...", "policy_id": "...", "risk_score": 0.0 },
      "execution_result": { "status": "SUCCESS", "balance": "1000.0 HBAR", ... },
      "sequence": 1
    },
    {
      "intent_id": "uuid",
      "timestamp": "2026-04-11T18:31:00.000Z",
      "actor_id": "operator-001",
      "actor_role": "treasury_admin",
      "action": { "action_type": "hbar_transfer", "to_account": "0.0.999999", "amount": 600.0, ... },
      "decision": { "verdict": "denied", "reason": "Transfer of 600.0 HBAR exceeds max...", "policy_id": "max-single-transfer", "risk_score": 0.95 },
      "execution_result": null,
      "sequence": 2
    }
  ]
}
```

### GET /api/policies
```json
{
  "policies": [
    { "id": "max-single-transfer", "description": "Single transfer > 500 HBAR -> denied", "threshold": 500 },
    { "id": "daily-limit", "description": "Daily cumulative > 2000 HBAR -> approval required", "threshold": 2000 },
    { "id": "approved-recipients", "description": "Recipient must be in whitelist" },
    { "id": "role-permission", "description": "Field agents have restricted transfer limits" },
    { "id": "high-value-review", "description": "Transfers 200-500 HBAR -> manual review" },
    { "id": "low-value-auto", "description": "Transfer < 200 HBAR to approved recipient -> auto-approved" }
  ]
}
```

### GET /api/actors
```json
{
  "actors": [
    { "id": "operator-001", "role": "treasury_admin", "daily_limit": 2000, "max_single_transfer": 500, "approved_recipients": ["0.0.456789", "0.0.789012", "0.0.654321"] },
    { "id": "operator-002", "role": "partner_operator", "daily_limit": 1000, "max_single_transfer": 300, "approved_recipients": ["0.0.456789"] },
    { "id": "field-agent-001", "role": "field_agent", "daily_limit": 200, "max_single_transfer": 100, "approved_recipients": ["0.0.456789"] }
  ]
}
```

### POST /api/reset
Clears audit log and daily spending tracker for demo reset.

## Demo Flow (the 3-minute pitch — THIS IS WHAT THE UI MUST NAIL)

### Beat 1: "What's in the treasury?" (30s)
- Actor: operator-001 (treasury_admin)
- Input: "Check the balance of our treasury account"
- Expected: APPROVED → balance shown

### Beat 2: "The breach" (45s)
- Actor: operator-001 (treasury_admin)
- Input: "Transfer 600 HBAR to 0.0.999999 for emergency disbursement"
- Expected: DENIED — exceeds 500 HBAR limit AND unknown recipient
- THE DENIAL GETS LOGGED — this is the key differentiator

### Beat 3: "The governed payout" (45s)
- Actor: operator-001 (treasury_admin)
- Input: "Pay 50 HBAR to 0.0.456789 for partner payout"
- Expected: APPROVED → executed → logged

### Beat 4: "The evidence" (60s)
- Click "Replay Audit Trail"
- Shows BOTH the denial AND approval in chronological order
- Proves: delegated intent, guarded execution, and evidence

## Design Tokens

```css
/* Colors */
--color-bg: #0a0a1a;            /* Dark background */
--color-surface: #1a1a2e;       /* Card surfaces */
--color-surface-alt: #16213e;   /* Secondary surface */
--color-approved: #00d4aa;      /* Green — approved */
--color-denied: #e94560;        /* Red — denied */
--color-pending: #f5a623;       /* Amber — manual review / approval required */
--color-text: #eaeaea;          /* Primary text */
--color-text-muted: #8892b0;    /* Secondary text */
--color-border: #2a2a4a;        /* Subtle borders */

/* Typography */
--font-display: 'Space Mono', monospace;   /* Transaction data, headings */
--font-body: 'IBM Plex Sans', sans-serif;  /* Body text, UI labels */
```

Google Fonts import:
```html
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

## Design Direction

**Aesthetic:** Dark, institutional, command-center. Bloomberg terminal meets modern fintech.
This is a governance and compliance tool — it should feel serious, precise, and trustworthy.
NOT generic AI slop. NOT purple gradients on white. NOT cookie-cutter dashboards.

**Key visual elements:**
- Dark background with crisp card surfaces
- Monospace font (Space Mono) for transaction data, account IDs, amounts
- Clean sans-serif (IBM Plex Sans) for UI labels and body text
- Color-coded verdict badges: green (approved), red (denied), amber (pending/review)
- Pipeline visualization showing each stage lighting up as it processes
- Subtle glow effects on active/processing states
- Status transitions should feel immediate and decisive

## Component Spec

### Layout
Left sidebar: policies + actors
Center: intent input + pipeline visualizer + result card
Right panel: audit trail (scrollable)

### Components

1. **Header** — "Sika Sentinel" in Space Mono, subtitle "Runtime Control & Evidence Layer for SikaHub"

2. **IntentInput** — Large text input for natural-language commands. Dropdown to select actor (operator-001/treasury_admin, operator-002/partner_operator, field-agent-001/field_agent). Submit button. Should feel like a command terminal.

3. **PipelineView** — Five-stage horizontal pipeline: Intent → Context → Policy → Execution → Evidence. Each stage is a node/block. When processing, stages light up sequentially. Final state shows which stage produced the verdict.

4. **ResultCard** — Shows after submission. Verdict badge (StatusBadge), reason text, structured action details (from/to/amount), execution result if approved. Should be prominent and unmissable.

5. **AuditTrail** — Scrollable list of AuditCard components. Auto-updates after each submission. Shows chronological history of ALL decisions.

6. **AuditCard** — Individual record: timestamp, actor, action summary, verdict badge, reason. Compact but readable. Monospace for account IDs and amounts.

7. **PolicyList** — Collapsible list of active rules. Each rule shows ID, description, threshold if applicable.

8. **StatusBadge** — Shared component. Verdict string → colored badge. approved=#00d4aa, denied=#e94560, approval_required=#f5a623, manual_review=#f5a623 with dashed border.

## Tech

- React + TypeScript + Vite (already scaffolded)
- Tailwind CSS (already installed)
- No additional state management — useState + useEffect is fine
- API base URL: `const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"`
- No routing needed — single page app

## Running

```bash
cd frontend
npm run dev
```
