# Sika Sentinel — Hackathon PRD
### Agentic Society Hackathon · 11–12 April 2026

---

## 1. Problem Statement

Financial workflows break down when humans or AI agents are permitted to move money without clear limits, coordination, or evidence. There is no runtime layer that simultaneously interprets delegated payment intent, enforces deterministic policy, and produces tamper-evident proof of both approved and rejected actions — across organisational boundaries, in real time.

**Target Users**:
- **Primary (B2B)**: Partner operators, remittance businesses, fintechs, NGOs, and treasury teams running delegated financial workflows. These actors need to delegate payment authority without losing control or auditability.
- **Secondary (B2C, future)**: SikaHub end-users whose payment actions will be governed by the same runtime engine through user-delegated flows.

**Current Solutions**: Enterprise treasury platforms (e.g. Kyriba, Coupa) offer approval workflows, but they are closed, institution-owned, and not machine-native. AI agent frameworks can interpret instructions and trigger actions but have no built-in policy enforcement or verifiable audit trail. Private databases give operators an internal record, but not cross-party verifiable evidence.

**Why Web3?**: The core gap that Web2 cannot close is *cross-boundary trust*. A private database gives you "we say this happened." Hedera gives you ordered, tamper-evident, shared evidence that multiple counterparties — operators, partners, regulators, auditors — can independently verify. Additionally, HBAR and HTS provide machine-native value movement: an AI agent can execute a real programmable financial transfer without proxying through a bank API or batch process. These two properties together — verifiable evidence and native programmable value — are not available on Web2 infrastructure.

---

## 2. Solution Overview

Sika Sentinel is a runtime control and evidence layer for delegated financial action. It accepts payout or treasury instructions in natural language, parses them into structured internal actions, loads policy-relevant context, applies deterministic rules, executes approved actions on Hedera, and records the full decision trail — approvals and denials — to an immutable on-ledger log.

The result is a governed payout workflow where AI agents (or human operators) can act within defined bounds, and any stakeholder can replay and verify the exact sequence of what happened, what was allowed, and what was blocked.

**Hackathon Track Alignment**: Core alignment with the *Agentic Economy* theme. Sentinel is precisely the kind of agent that "makes payments, manages tokens, coordinates decisions, and proves its actions on-chain" — as described in the hackathon brief. It directly addresses the compliance agent and agentic payment flow ideas cited as inspiration.

### Key Features (MVP)

1. **Natural-language payout input** — Operators submit instructions like "Send 5 HBAR to approved partner wallet 0.0.800." This is the human/agent interface. MVP proves agents can express intent naturally.
2. **Structured intent parsing** — Instructions are converted to stable action objects (type, amount, recipient, actor, context). Makes all downstream logic deterministic regardless of how the instruction was worded.
3. **Deterministic policy evaluation** — The clearance engine checks actor role, amount threshold, approved recipient list, and treasury posture. Approves, denies, or escalates. The model understands intent; the rules decide whether money moves.
4. **Approved HBAR transfer execution** — Approved actions trigger a real Hedera transfer via the Agent Kit or Hiero CLI adapter. Sentinel only executes what policy permits.
5. **Denial handling with reason** — Blocked actions return a structured denial reason without executing. This is as important as approvals for the audit story.
6. **HCS audit trail** — Both outcomes (approved and denied) are written to a Hedera Consensus Service topic with full decision context: actor, action, policy result, timestamp, and correlation ID.
7. **Audit replay / evidence view** — The demo UI shows the ordered HCS event history, proving the trail is verifiable and not internally editable.

### Non-Goals (v1 / Hackathon Scope)

- No HTS tokenised payout assets or stable-value rails
- No scheduled or recurring transactions
- No smart contracts / Path B EVM logic
- No multi-agent routing or agent-to-agent negotiation
- No live production key management or HSM integration
- No consumer-facing SikaHub UX (B2C extension is post-hackathon)

---

## 3. Hedera Integration Architecture

### Network Services Used

| Service | Purpose | Why This Service? |
|---------|---------|-------------------|
| **Hedera Consensus Service (HCS)** | Immutable, ordered audit trail for every decision (approved and denied) | Tamper-evident, timestamped, shared event log — multiple parties can verify independently. Hedera's own docs call out AI decision logging as a primary HCS use case. |
| **HBAR Transfers** | Execution rail for approved payout actions | Native, fast (~3–5s finality), fixed-cost, machine-usable value movement. No third-party payment rails needed. |
| **Hedera Agent Kit (Path A)** | Natural-language orchestration and Hedera tool integration | Provides LangChain-compatible tools for account ops, HBAR transfers, HCS messaging, and HTS interactions — exactly the stack Sentinel needs. Recommended path for this hackathon. |
| **Hiero CLI (optional adapter)** | Scriptable execution backend for approved on-chain actions | CLI is explicitly designed for AI coding agents to invoke on-chain actions via the terminal. Acts as a controlled execution adapter when Agent Kit needs a CLI shim. |

### Ecosystem Integrations

| Partner/Platform | Integration Type | Value Added |
|-----------------|------------------|-------------|
| **Hedera Agent Lab** | Reference environment for testing agent flows | Browser-based, no-code builder — useful for rapid iteration and demo validation during hackathon |
| **HashScan** | Block explorer for live demo evidence | Lets judges verify HCS topic entries and HBAR transfers in real time during the presentation |

### Architecture Diagram

```
Operator / Agent
       │
       ▼
[1] Natural-Language Input
       │
       ▼
[2] Intent Layer (Agent Kit / LangChain)
    └─ Parses to structured Action Object
       │
       ▼
[3] Context Engine
    └─ Loads: actor role, approved recipients,
              amount thresholds, treasury mode
       │
       ▼
[4] Policy / Clearance Engine
    └─ APPROVED → [5a]
    └─ DENIED   → [5b]
       │
       ├─ [5a] Hedera Execution Layer
       │        └─ HBAR Transfer (Agent Kit / Hiero CLI)
       │
       └─ [5b] Denial Handler
                └─ Structured reason returned
       │
       ▼
[6] Evidence Layer
    └─ HCS Topic: decision trail written
       (action, result, actor, timestamp, correlation ID)
       │
       ▼
[7] Audit Replay UI
    └─ Ordered HCS event history displayed
    └─ HashScan link for independent verification
```

---

## 4. Hedera Network Impact

### Account Creation
- Each partner operator onboarded requires a Hedera account (Account ID + key pair). At MVP, the demo creates at least 2–3 testnet accounts (operator, recipient, treasury).
- Post-hackathon: every B2B partner and, eventually, every SikaHub end-user requires a Hedera account. Target market of 50+ partner operators in year one = 50+ new institutional accounts plus associated operational wallets.
- **Estimated accounts (hackathon demo)**: 3–5 testnet accounts
- **Estimated accounts (12-month trajectory)**: 500–5,000 (operator accounts + sub-accounts per workflow)

### Active Accounts
- Every payout workflow cycle generates active account activity. A single remittance operator running daily payouts = multiple daily active account touches.
- **Estimated MAA (12-month)**: 200–2,000 depending on partner onboarding pace

### Transactions Per Second (TPS)
- Each governed payout generates at minimum 2 transactions: an HBAR transfer + an HCS message. Denial-only flows generate 1 HCS message.
- A mid-size remittance operator processing 500 payouts/day = ~1,000 daily Hedera transactions.
- At 10 operators: ~10,000 transactions/day → ~0.12 TPS sustained, with burst peaks at batch processing times.
- **Estimated daily transactions (12-month)**: 5,000–50,000 depending on operator volume

### Audience Exposure
- **New to Hedera**: Remittance operators, fintechs, and NGOs in Sub-Saharan Africa and diaspora corridors — a largely untapped Hedera audience.
- **Market context**: GSMA reports strong double-digit mobile money ecosystem growth in Sub-Saharan Africa (2024). World Bank data shows Sub-Saharan Africa remains the most expensive remittance-receiving region globally. Bank of Ghana reports 80% financial inclusion (2024) with ongoing payment modernisation focus.
- This audience is enterprise-facing, high-transaction-volume, and compliance-sensitive — ideal for demonstrating Hedera's fixed fees, finality, and auditability at scale.

---

## 5. Innovation & Differentiation

### Ecosystem Gap
No existing Hedera project combines runtime policy enforcement with on-ledger decision evidence for delegated financial action. The Agent Kit provides tools for *doing* things on Hedera; Sentinel adds the governance layer that controls *whether* those things are allowed and *proves* what happened. This is a new capability class for the Hedera ecosystem.

### Cross-Chain Comparison
- **Coinbase agentic wallets / x402**: Focus on machine-native payments and agent commerce. No policy enforcement or auditability layer.
- **Nevermined**: Economic orchestration and metering for autonomous agents. Not designed for institutional delegated payment governance.
- **Lynx Token (prior Hedera hackathon)**: Used LangChain + hedera-agent-kit for treasury rebalancing via HCS — validates the architectural direction, but does not include clearance logic or denial evidence.
- **Enterprise treasury platforms (Kyriba, Coupa)**: Approval workflows exist, but are closed-system, institution-owned, and not machine-native or blockchain-executable.

**Sentinel's gap**: existing systems either help agents pay autonomously, or help institutions keep private records. Sentinel governs *delegated* financial action at runtime and preserves evidence in a form that multiple stakeholders across organisational boundaries can trust.

### Novel Hedera Usage
Using HCS not merely as a log of successful transactions, but as a **decision evidence layer** — capturing denials, policy context, and correlation IDs alongside approvals. This creates a verifiable governance record rather than just a transaction history. This framing of HCS has not been seen before in the Hedera ecosystem.

---

## 6. Feasibility & Business Model

### Technical Feasibility

- **Hedera Services Required**: HCS (topic creation + message submission), HBAR transfers, Hedera Agent Kit (JS or Python), optional Hiero CLI
- **Team Capabilities**: Python-led implementation, fast iteration, AI-assisted coding (Claude Code, Codex, Gemini, ChatGPT), frontend (React/JS), UX, and data/backend support
- **Technical Risks**:
  1. Agent Kit API surface is new — unexpected tool behaviour under load
  2. HCS message latency in demo conditions
  3. Frontend/backend integration time pressure in 17-hour window
- **Mitigation**:
  1. Use hedera-agent-kit v3 (npm) with documented examples; fallback to Hiero CLI for execution if Agent Kit tools stall
  2. HCS is documented as ~3–5s finality — demo flow paced to accommodate
  3. Frontend scoped to a single operator view with minimal state — Angela + Jules own this with clear interface spec from Don

### Business Model (Lean Canvas)

| Element | Description |
|---------|-------------|
| **Problem** | 1) Delegated payment flows lack runtime enforcement across org boundaries. 2) AI agents can execute financial actions without verifiable governance. 3) Audit trails in existing systems are privately owned and not cross-party verifiable. |
| **Solution** | 1) Deterministic policy engine applied at runtime before execution. 2) Agent Kit–powered natural-language orchestration on Hedera. 3) HCS-based immutable decision evidence layer. |
| **Key Metrics** | Governed transactions per day, denial rate (policy effectiveness), HCS messages per workflow, partner operator accounts, audit replay usage |
| **Unique Value Prop** | The only runtime layer that governs delegated financial action and produces verifiable evidence — for both approved and rejected transactions — across organisational boundaries on Hedera. |
| **Unfair Advantage** | Domain knowledge in cross-border payments and financial inclusion (Ghana/Africa corridor); prior ecosystem validation (EasyA × Stellar Meridian 2024); Hedera-native execution removes reliance on proprietary payment rails |
| **Channels** | Direct B2B outreach to remittance operators and fintechs; Hedera ecosystem developer community; incubator pathway (Hedera incubator launching 18 May); fintech accelerators in Ghana/UK diaspora corridor |
| **Customer Segments** | Primary: remittance operators, fintechs, NGO treasury teams, partner networks. Secondary (future): SikaHub end-users via delegated consumer payment flows |
| **Cost Structure** | Hedera transaction fees (fractions of a cent each — predictable and fixed); infrastructure (cloud compute for agent runtime); team development |
| **Revenue Streams** | SaaS subscription per operator (monthly governance fee); per-transaction fee on governed payouts above threshold; future: compliance-as-a-service API for third-party integrations |

### Why Web3 is Required

Three specific properties that Web2 cannot replicate:
1. **Tamper-evident cross-boundary evidence**: HCS provides a shared, ordered, independently verifiable event log. A private database provides an editable internal record. For multi-party financial workflows, these are not equivalent.
2. **Machine-native programmable value movement**: HBAR transfers execute on an open network with finality, fixed fees, and no third-party intermediary. Web2 equivalents require bank APIs, proprietary rails, or batch settlement.
3. **Portable governance across B2B and B2C surfaces**: A blockchain-native runtime and evidence layer works across organisations without binding all parties to one institution's identity model or infrastructure.

---

## 7. Execution Plan

### MVP Scope (Hackathon)

| Feature | Priority | Estimated Effort | Hedera Service |
|---------|----------|-----------------|----------------|
| Natural-language payout input + parsing | P0 | 2h | Agent Kit (LangChain) |
| Context engine (actor, recipient, threshold loading) | P0 | 2h | None (local state) |
| Deterministic policy / clearance engine | P0 | 3h | None (local rules) |
| HBAR transfer execution (approved path) | P0 | 2h | HBAR / Agent Kit |
| Denial handler + reason output | P0 | 1h | None |
| HCS audit trail (approved + denied) | P0 | 2h | HCS |
| Operator UI (input → decision → result) | P0 | 3h | — |
| Audit replay / evidence view | P1 | 2h | HCS (mirror node read) |
| Demo script + polish | P1 | 1h | — |

**Total estimated effort**: ~18 person-hours across a 5-person team over 17 hours. Parallel execution is required and planned.

### Team Roles

| Member | Role | Key Responsibilities |
|--------|------|---------------------|
| Don | Product / Technical Lead / Architecture | System architecture, Hedera integration, agent orchestration, demo logic, end-to-end flow, AI coding tools |
| Angela | Frontend | Operator-facing demo UI: input, decision display, audit view |
| Jules | UX/UI + Frontend support | UX structure, interface clarity, demo legibility, frontend polish |
| Riley | Data / Backend support | State management, policy-relevant context store, persistence, backend integration |
| David | Generalist / QA / gap-filling | Testing, integration validation, documentation, edge-case coverage |

### Design Decisions

| Decision | Options Considered | Choice | Rationale |
|----------|-------------------|--------|-----------|
| Execution path | Agent Kit vs Hiero CLI | Agent Kit (primary), Hiero CLI (fallback) | Agent Kit provides native LangChain integration and all required tools; CLI provides a deterministic fallback if Agent Kit tools have issues |
| Token layer | HTS tokens vs HBAR only | HBAR only for MVP | Removes unnecessary complexity; core value is governance + evidence, not asset type. HTS is a clean post-hackathon extension. |
| Policy engine | AI-driven vs deterministic rules | Deterministic rules engine | Model interprets intent; rules decide money movement. Determinism is required for auditability and regulatory defensibility. |
| Evidence format | Private log vs HCS | HCS | Cross-party verifiability is the product's core value proposition. Private logs undermine it. |
| Language/SDK | JS/TS vs Python | Python (primary) | Team is strongest in Python; hedera-agent-kit Python v1.0 supports LangChain and all required services. |

### Post-Hackathon Roadmap

- **Month 1–2**: Refine clearance engine with real operator policy profiles; integrate HashPack for wallet auth; add HTS as optional payout token layer; apply for Hedera incubator (18 May cohort)
- **Month 3–6**: Onboard 2–3 pilot partner operators in Ghana/UK corridor; implement scheduled transactions for recurring payouts; build compliance reporting dashboard over HCS evidence
- **Month 6–12**: Launch SikaHub consumer delegation flows; introduce smart contract escrow for multi-party settlement; pursue fintech licensing pathways; target 10+ operator accounts generating 10,000+ daily Hedera transactions

---

## 8. Validation Strategy

### Feedback Sources

- **Ecosystem stakeholders**: EasyA × Stellar Meridian Hackathon (London, October 2024) — SikaHub/SikaChain vision resonated with judges; one Stellar Foundation judge explicitly asked to stay updated afterwards
- **Market evidence**: GSMA 2024 mobile money growth data (Sub-Saharan Africa leads globally in new active accounts); World Bank remittance pricing data (Sub-Saharan Africa remains most expensive receiving region); Bank of Ghana National Payment Systems Strategy 2024 (80% financial inclusion, ongoing interoperability focus)
- **Future targets**: Direct outreach to remittance operator partners in Ghana and UK diaspora corridor; fintech accelerators; Hedera developer community

### Validation Milestones

| Milestone | Target | Timeline |
|-----------|--------|----------|
| Hackathon demo feedback | Judge Q&A responses, post-demo follow-up interest | 12 April 2026 |
| Hedera incubator application | Accepted into 18 May cohort | April 2026 |
| First pilot operator conversation | Qualified intro meeting with remittance operator | May 2026 |
| Pilot integration | 1 operator running governed payouts on testnet | July 2026 |
| First paid engagement | LOI or paid pilot agreement | September 2026 |

### Market Feedback Cycles

1. **Cycle 1 — Hackathon**: Demo to judges and peers; capture questions and objections; identify which features generate the most interest
2. **Cycle 2 — Incubator / early operator outreach**: Present Sentinel to 5–10 remittance operators and fintech partners; test whether "governed delegated payment + verifiable evidence" resonates with compliance and treasury decision-makers
3. **Cycle 3 — Testnet pilot**: Onboard 1–2 operators onto Hedera testnet; measure actual transaction patterns, policy hit rates, and audit replay usage; iterate on clearance engine rules and UX

---

## 9. Go-To-Market Strategy

### Target Market

- **Total Addressable Market (TAM)**: Global cross-border payment market — $190B+ in annual remittance flows to Sub-Saharan Africa alone (World Bank 2024); broader B2B treasury and delegated payment software market is multi-billion
- **Serviceable Addressable Market (SAM)**: Remittance operators, fintechs, and NGOs in Africa-focused payment corridors seeking programmable compliance and audit infrastructure — estimated 500–2,000 addressable operators
- **Initial Target Segment**: 10–50 partner operators in Ghana/UK and West Africa diaspora corridors under pressure to demonstrate payment compliance and reduce operational risk

### Distribution Channels

1. **Direct B2B outreach**: Founder-led sales to remittance operators and fintechs in Ghana/UK corridor; leverage existing ecosystem relationships from EasyA × Meridian and SikaHub network
2. **Hedera ecosystem**: Developer community, incubator cohort (18 May), hackathon visibility — positions Sentinel as infrastructure for other Hedera-native financial applications
3. **Fintech accelerators and compliance networks**: Partnerships with Ghana fintech accelerators, Bank of Ghana innovation programmes, and UK FCA sandbox pathways

### Growth Strategy

- Land with a single high-volume operator; use their HCS evidence volume as a proof point for the next operator
- Build an API layer so third-party Hedera dApps can use Sentinel as a governance module — expands TAM without direct sales effort
- Expand to SikaHub consumer flows once B2B governance engine is stable, bringing end-user volume to the Hedera network

---

## 10. Pitch Outline

### Recommended 3-minute Demo Script

1. **The Problem** (30 sec):
   > "When AI agents or humans are allowed to move money without limits or proof, financial workflows fail. There's no layer that enforces policy at runtime and creates verifiable evidence — across organisational boundaries — for delegated payments. That's the gap Sika Sentinel fills."

2. **The Solution** (60 sec):
   > "Sika Sentinel is a runtime control and evidence layer for delegated financial action. Watch: I type a payout instruction in natural language. Sentinel parses it, checks policy, executes — or blocks. And regardless of outcome, the full decision is written to Hedera Consensus Service. Immutably. Verifiably. Right now."
   - *Demo step 1*: Submit an instruction that should be denied → show denial reason + HCS entry
   - *Demo step 2*: Submit an approved instruction → show HBAR transfer + HCS entry
   - *Demo step 3*: Show audit replay with both entries in order; open HashScan to verify on-chain

3. **Hedera Integration** (30 sec):
   > "We use three Hedera primitives: the Agent Kit for natural-language-to-action orchestration, HBAR for machine-native value movement, and HCS for tamper-evident decision evidence. HCS is doing something you may not have seen before — logging not just approvals, but denials and policy context, creating a governance record rather than just a transaction log."

4. **Traction** (20 sec):
   > "We validated the SikaHub vision at EasyA × Stellar Meridian in October 2024 — a Stellar Foundation judge asked to stay updated. The market signal is strong: Sub-Saharan Africa is the fastest-growing mobile money region globally, and the most expensive remittance corridor in the world."

5. **The Opportunity** (20 sec):
   > "This is infrastructure. Every operator, fintech, or NGO running delegated payment workflows on Hedera is a potential customer. We monetise on subscription plus per-transaction governance fees. The Hedera incubator launching May 18th is our next step."

6. **The Ask** (10 sec):
   > "We're building Sika Sentinel to be the governance layer for the agentic economy on Hedera. We'd love your support, introductions to operators, and a path into the incubator."

### Key Metrics to Present

- World Bank: Sub-Saharan Africa average remittance cost — still well above SDG 3% target (World Bank Remittance Prices Worldwide, 2024)
- GSMA: Sub-Saharan Africa leads globally in new active mobile money accounts (GSMA State of the Industry Report, 2024)
- Bank of Ghana: 80% financial inclusion achieved 2024; ongoing payment modernisation (Bank of Ghana National Payment Systems Strategy 2024)
- Live demo metric: HCS topic ID + message count generated during presentation (prove real on-chain activity)

---

## Parking Lot (Future Ideas)

- **HTS payout tokens**: Stable-value internal representation for cross-corridor settlement; controllable issuance and custom fees
- **Scheduled Transactions**: Recurring payouts, deferred execution for multi-sig approval workflows
- **Smart Contract escrow (Path B)**: Programmable settlement for multi-party financial arrangements
- **Multi-agent routing**: Agent-to-agent coordination where Sentinel governs handoffs between sub-agents
- **Compliance API**: Third-party Hedera dApps consume Sentinel as a governance module
- **SikaHub consumer flows**: End-user delegated payments governed by the same runtime engine

---

## Section-to-Criteria Mapping

| PRD Section | Judging Criteria Addressed |
|-------------|---------------------------|
| 1. Problem Statement | Feasibility, Pitch |
| 2. Solution Overview | Innovation, Pitch, Execution |
| 3. Hedera Integration | Integration (primary), Innovation |
| 4. Network Impact | Success (primary) |
| 5. Innovation | Innovation (primary) |
| 6. Feasibility & Business Model | Feasibility (primary) |
| 7. Execution Plan | Execution (primary) |
| 8. Validation Strategy | Validation (primary) |
| 9. Go-To-Market | Execution, Success |
| 10. Pitch Outline | Pitch (primary) |
