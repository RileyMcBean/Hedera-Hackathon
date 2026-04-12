# Sika Sentinel

Runtime governance and evidence layer for delegated financial actions on Hedera.

Sika Sentinel sits between a natural-language instruction and a Hedera transaction. Every action is parsed, evaluated against a deterministic policy engine, conditionally executed, and written as an immutable audit event to Hedera Consensus Service — including denied and blocked outcomes.

---

## What it does

A human operator or automated agent submits a plain-English payment instruction. Sika Sentinel:

1. **Parses the instruction** into a structured action with confidence scoring
2. **Loads actor context** — role, transfer limits, approved recipients, treasury posture
3. **Evaluates policy** deterministically across 7 rules (R001–R007)
4. **Executes or schedules** the action on Hedera testnet if approved
5. **Writes an audit event** to Hedera Consensus Service for every outcome — approved, denied, blocked, or scheduled

---

## Four-stage runtime

```
Natural language instruction
          │
          ▼
┌─────────────────────────┐
│  Stage 1                │  Intent Parser Agent
│  Parse → structured     │  Heuristic-first, LLM fallback
│  action + confidence    │  Blocks low-confidence instructions
└─────────────────────────┘
          │
          ▼
┌─────────────────────────┐
│  Stage 2                │  Context Engine
│  Load actor context     │  Role, limits, allowlist, treasury posture
└─────────────────────────┘
          │
          ▼
┌─────────────────────────┐
│  Stage 3                │  Clearing Agent & Execution
│  Evaluate policy        │  7 deterministic rules
│  Execute / Schedule     │  APPROVED → transfer, APPROVAL_REQUIRED → schedule
└─────────────────────────┘
          │
          ▼
┌─────────────────────────┐
│  Stage 4                │  Evidence Layer
│  Write HCS audit event  │  All outcomes, with payload integrity hash
│  Replay from Mirror Node│
└─────────────────────────┘
```

---

## Policy rules

| Rule | ID | Trigger | Decision |
|------|-----|---------|---------|
| Frozen treasury | R001 | Treasury posture = FROZEN | DENIED |
| Restricted posture | R002 | Treasury posture = RESTRICTED | APPROVAL_REQUIRED |
| Amount exceeds threshold | R004 | Amount > actor limit | APPROVAL_REQUIRED |
| Recipient not allowlisted | R005 | Recipient not in approved list | DENIED |
| Zero amount | R006 | Amount ≤ 0 | DENIED |
| Self-transfer | R007 | Actor == recipient | DENIED |

Rules are evaluated in order with short-circuit logic. Policy evaluation is a pure function — no network calls, no LLM.

---

## Scheduled transaction approval flow

When the policy engine returns `APPROVAL_REQUIRED`, Sika Sentinel creates a real Hedera `ScheduleCreateTransaction`. The inner transfer is registered on-network but funds are not released.

A secondary signer can approve via `POST /api/schedule/approve`, which submits a `ScheduleSignTransaction` with the treasury key. Hedera automatically executes the inner transfer in the same consensus round and returns a `scheduledTransactionId` — the ID of the actual HBAR transfer, separate from the signing transaction.

Both the schedule creation and the approval are written as distinct HCS audit events, making the full approval lifecycle replayable.

---

## HCS audit trail and payload integrity

### Why HCS, not a database

A private database audit log is only as trustworthy as the operator who controls it. Hedera Consensus Service gives three guarantees a private log cannot:

- **Tamper-evidence by construction.** Each HCS message receives a consensus timestamp and sequence number assigned by the network. The ordered sequence cannot be rewritten after the fact.
- **Decoupled write authority.** Even if the Sika Sentinel server is compromised, past audit events on HCS cannot be altered — only new (detectable) messages can be appended.
- **Verifiable replay.** Any third party can independently replay the full audit history from the Mirror Node using only the topic ID.

### Payload integrity check

In addition to HCS's ledger-level ordering guarantees, each audit event carries a `payloadHash` field:

- `payloadHash` is computed as SHA-256 over a **canonical JSON serialization** of the audit payload, with the `payloadHash` field itself **excluded** from the input. Keys are sorted recursively to ensure deterministic output regardless of field insertion order.
- On replay, the hash is recomputed over the fetched payload (excluding `payloadHash`) and compared to the stored value.
- The replay UI shows `integrity: verified` (green) or `integrity: mismatch` (red) on each event.

This is an additional integrity check for audit payload handling — it detects accidental corruption or tampering with the JSON content of an event. It is **not** a replacement for the ledger-level ordering and tamper-evidence guarantees that HCS already provides, and it is not a cryptographic signature scheme or Merkle proof system.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | TypeScript, Next.js 14 App Router |
| Hedera | `@hashgraph/sdk` — TransferTransaction, ScheduleCreateTransaction, ScheduleSignTransaction, TopicMessageSubmitTransaction, AccountBalanceQuery |
| Agent Kit | `@hashgraph/hedera-agent-kit` + LangChain JS (LLM fallback path) |
| Schema validation | Zod |
| Audit replay | Hedera Mirror Node REST API |
| UI | React, Tailwind CSS |

---

## API routes

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/run` | Submit a natural-language instruction through the full pipeline |
| `POST` | `/api/schedule/approve` | Submit secondary approval for a pending scheduled transaction |
| `GET` | `/api/audit/replay` | Fetch and verify the on-chain audit history from HCS |
| `GET` | `/api/whitelist?actorId=` | Get approved recipients for an actor |
| `POST` | `/api/whitelist` | Add an approved recipient for an actor |

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values.

```bash
# Hedera network
HEDERA_NETWORK=testnet

# Operator account (pays all transaction fees)
HEDERA_OPERATOR_ID=0.0.XXXXXX
HEDERA_OPERATOR_KEY=<ECDSA private key>

# Treasury / payout source account
HEDERA_TREASURY_ID=0.0.XXXXXX
HEDERA_TREASURY_KEY=<ECDSA private key>

# Secondary approver for scheduled transactions (falls back to treasury if unset)
# HEDERA_APPROVER_ID=0.0.XXXXXX
# HEDERA_APPROVER_KEY=<ECDSA private key>

# HCS audit topic (run `npm run create-topic` to create one)
HCS_TOPIC_ID=0.0.XXXXXX

# Mirror Node base URL
MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com

# LLM (optional — enables LLM fallback in the Intent Parser)
OPENAI_API_KEY=sk-...

# Execution backend: sdk | dry_run
TRANSFER_BACKEND=sdk
```

---

## Getting started

```bash
npm install
cp .env.example .env
# fill in .env

# Create an HCS audit topic (one-time)
npm run create-topic

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Demo flows

The UI includes quick-fill instructions for four canonical outcomes:

| Outcome | Example instruction |
|---------|-------------------|
| **APPROVED** | `Send 5 HBAR to 0.0.8598115` |
| **APPROVAL_REQUIRED** | `Send 200 HBAR to 0.0.8598115` (exceeds 100 HBAR limit) |
| **DENIED** | `Send 5 HBAR to 0.0.9999999` (not on allowlist) |
| **PARSE_BLOCKED** | `Send money` (vague — clarification required) |

All four are demoable from the UI without touching code or config. Each outcome writes to HCS and appears in the on-chain replay history with its integrity hash.

---

## Project structure

```
src/
  schemas/          action.ts, policy.ts, audit.ts
  context/          loader.ts — actor/treasury context store
  policy/           engine.ts — 7 deterministic rules
  hedera/           config.ts, transfer.ts, balance.ts, schedule.ts, hcs.ts
  audit/            trail.ts, integrity.ts
  agents/           intentParser.ts
  runtime/          pipeline.ts

app/
  page.tsx          Demo UI — four-stage pipeline dashboard
  api/run/          POST /api/run
  api/schedule/     POST /api/schedule/approve
  api/audit/        GET  /api/audit/replay
  api/whitelist/    GET+POST /api/whitelist

scripts/
  context_store.json    Actor config, thresholds, approved recipients
  createTopic.ts        One-time HCS topic creation
```
