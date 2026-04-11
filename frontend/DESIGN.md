# Sika Sentinel — Design System

## Aesthetic Direction

**Bloomberg terminal meets modern fintech governance.**

This is a compliance and evidence tool. It should feel serious, precise, and institutional — not generic dashboard. No purple gradients. No decorative flourishes. Every visual element earns its place by communicating state.

## Layout

```
┌─────────────────────────────── HEADER ───────────────────────────────────┐
├───────────────┬──────────────────────────────┬───────────────────────────┤
│  LEFT SIDEBAR │        CENTER MAIN           │    RIGHT: AUDIT TRAIL     │
│  (280px)      │       (flex-1)               │      (320px)              │
│               │                              │                           │
│  POLICIES     │  INTENT INPUT                │  Chronological log of     │
│  ──────────── │  ┌──────────────────────┐   │  ALL decisions (approved  │
│  ▶ policy-1  │  │ [actor] [text...]    │   │  AND denied).             │
│  ▶ policy-2  │  └──────────────────────┘   │                           │
│               │                              │  ● APPROVED 18:30:00     │
│  ACTORS       │  PIPELINE VIEW               │  ● DENIED   18:31:00     │
│  ──────────── │  [I]→[C]→[P]→[E]→[Ev]      │  ● APPROVED 18:32:00     │
│  ▶ op-001    │                              │                           │
│  ▶ op-002    │  RESULT CARD                 │  [Replay] [Reset]        │
│  ▶ field-001 │  ╔══════════════╗           │                           │
│               │  ║ VERDICT      ║           │                           │
│               │  ╚══════════════╝           │                           │
└───────────────┴──────────────────────────────┴───────────────────────────┘
```

## Design Tokens

```css
--bg:          #0a0a1a   /* outer background */
--surface:     #1a1a2e   /* card surfaces */
--surface-alt: #16213e   /* secondary surface */
--border:      #2a2a4a   /* subtle borders */
--text:        #eaeaea   /* primary text */
--muted:       #8892b0   /* secondary text */
--approved:    #00d4aa   /* green — approved */
--denied:      #e94560   /* red — denied */
--pending:     #f5a623   /* amber — review / approval required */
```

## Typography

- **Space Mono** — monospace. Transaction data, account IDs, amounts, headings. Signals precision.
- **IBM Plex Sans** — sans-serif. UI labels, body text, explanations. Signals clarity.

## Component Decisions

### Header
Minimal. Logo mark (shield icon), "SIKA SENTINEL" in Space Mono caps, subtitle in muted IBM Plex. A hairline border bottom. No clutter.

### IntentInput
Terminal aesthetic. Dark surface, monospace input field with a blinking cursor effect. Actor dropdown on the left. Submit reads "EXECUTE". Keyboard shortcut: Cmd+Enter.

### PipelineView
Five stage nodes connected by lines. Each stage:
- **idle**: dim border, muted text
- **active**: bright border + color glow, pulsing animation
- **complete**: solid color fill, checkmark
- **skipped**: dim, ×

Stage colors: active → intent/context/policy use --pending amber. Execution and evidence use --approved green (or --denied red on denial path). Evidence always fires regardless of verdict.

### ResultCard
Full-width. Left accent border (color matches verdict). Large verdict badge. Reason text. Action details in monospace grid. TX ID if available.

### AuditTrail
Right panel. Each record: compact card with timestamp, actor, action summary, verdict badge, reason. Monospace for addresses/amounts. New records slide in from top. Sequence number shown.

### PolicyList
Collapsible sections. Each rule: id in monospace, description in body font, threshold value if applicable.

## Animation Philosophy

- Pipeline stages: sequential reveal (300ms per stage)
- Active stage: subtle pulse/glow (`box-shadow` keyframe)
- Verdict badge: fade + scale on appearance
- Audit records: slide-down from top on new entry
- No gratuitous animation. Everything communicates state change.
