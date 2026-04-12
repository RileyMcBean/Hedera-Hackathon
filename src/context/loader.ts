/**
 * Context Engine — loads policy-relevant state for an Action.
 *
 * Store resolution order:
 *   1. Path given by the CONTEXT_STORE_PATH environment variable
 *   2. scripts/context_store.json  (default fixture location)
 *   3. Built-in in-memory fallback  (demo always works, even without a file)
 */

import { z } from "zod";
import fs from "fs";
import path from "path";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const TreasuryPostureSchema = z.enum(["NORMAL", "RESTRICTED", "FROZEN"]);
export type TreasuryPosture = z.infer<typeof TreasuryPostureSchema>;

export const ActorRoleSchema = z.enum(["OPERATOR", "PARTNER", "ADMIN"]);
export type ActorRole = z.infer<typeof ActorRoleSchema>;

// ── ContextSnapshot ───────────────────────────────────────────────────────────

export const ContextSnapshotSchema = z.object({
  actorId: z.string(),
  actorRole: ActorRoleSchema,
  partnerId: z.string(),
  amountThresholdHbar: z.number(),
  approvedRecipients: z.array(z.string()).default([]),
  treasuryPosture: TreasuryPostureSchema.default("NORMAL"),
  enforceRecipientAllowlist: z.boolean().default(true),
});

export type ContextSnapshot = z.infer<typeof ContextSnapshotSchema>;

// Backwards-compatible alias
export type PolicyContext = ContextSnapshot;

// ── Store schema (internal) ───────────────────────────────────────────────────

const ActorRecordSchema = z.object({
  role: ActorRoleSchema,
  partner_id: z.string(),
  amount_threshold_hbar: z.number(),
  approved_recipients: z.array(z.string()).default([]),
  enforce_recipient_allowlist: z.boolean().default(true),
});

const TreasuryRecordSchema = z.object({
  posture: TreasuryPostureSchema.default("NORMAL"),
});

const ContextStoreSchema = z.object({
  treasury: TreasuryRecordSchema.default({ posture: "NORMAL" }),
  actors: z.record(z.string(), ActorRecordSchema).default({}),
});

type ContextStore = z.infer<typeof ContextStoreSchema>;

// ── In-memory fallback ────────────────────────────────────────────────────────

const FALLBACK_STORE: ContextStore = {
  treasury: { posture: "NORMAL" },
  actors: {
    "0.0.100": {
      role: "OPERATOR",
      partner_id: "partner-alpha",
      amount_threshold_hbar: 100.0,
      approved_recipients: ["0.0.8596004", "0.0.8597846"],
      enforce_recipient_allowlist: true,
    },
    "0.0.200": {
      role: "PARTNER",
      partner_id: "partner-beta",
      amount_threshold_hbar: 25.0,
      approved_recipients: ["0.0.8596004", "0.0.8597846"],
      enforce_recipient_allowlist: true,
    },
    "0.0.300": {
      role: "ADMIN",
      partner_id: "internal-ops",
      amount_threshold_hbar: 500.0,
      approved_recipients: [],
      enforce_recipient_allowlist: false,
    },
  },
};

// Module-level cache: loaded once per process
let _store: ContextStore | null = null;

// ── Store loading ─────────────────────────────────────────────────────────────

const DEFAULT_STORE_PATH = path.resolve(
  __dirname,
  "../../scripts/context_store.json"
);

function resolveStorePath(): string {
  return process.env.CONTEXT_STORE_PATH ?? DEFAULT_STORE_PATH;
}

function loadStore(): ContextStore {
  if (_store !== null) return _store;

  const storePath = resolveStorePath();
  if (fs.existsSync(storePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(storePath, "utf-8"));
      _store = ContextStoreSchema.parse(raw);
    } catch (err) {
      console.warn(
        `Failed to parse context store at ${storePath} (${err}); using fallback`
      );
      _store = FALLBACK_STORE;
    }
  } else {
    _store = FALLBACK_STORE;
  }

  return _store;
}

/** Force the module to re-read the store file on the next loadContext() call. */
export function reloadStore(): void {
  _store = null;
}

/** Override the in-memory treasury posture for the current process (tests). */
export function setTreasuryPosture(posture: TreasuryPosture): void {
  const store = loadStore();
  store.treasury.posture = posture;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load policy-relevant context for the given actor.
 *
 * @throws {Error} If actorId is not found in the context store.
 */
export function loadContext(
  actorId: string,
  _recipientId?: string
): ContextSnapshot {
  const store = loadStore();

  if (!(actorId in store.actors)) {
    const known = Object.keys(store.actors);
    throw new Error(
      `Actor '${actorId}' is not registered in the context store. Known actors: ${JSON.stringify(known)}`
    );
  }

  const actor = store.actors[actorId];

  return {
    actorId,
    actorRole: actor.role,
    partnerId: actor.partner_id,
    amountThresholdHbar: actor.amount_threshold_hbar,
    approvedRecipients: actor.approved_recipients,
    treasuryPosture: store.treasury.posture,
    enforceRecipientAllowlist: actor.enforce_recipient_allowlist,
  };
}

export function getTreasuryPosture(): TreasuryPosture {
  return loadStore().treasury.posture;
}
