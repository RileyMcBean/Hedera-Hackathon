/**
 * Policy / Clearance Engine — deterministic rule evaluation.
 *
 * Rule catalogue (MVP)
 * --------------------
 *   R001  RECIPIENT_PRESENT     deny  if recipient_id is blank
 *   R002  AMOUNT_VALID          deny  if amount_hbar is missing or <= 0
 *   R003  ACTOR_AUTHORISED      deny  if actor role not in permitted set
 *   R004  TREASURY_NOT_FROZEN   deny  if treasury posture is FROZEN
 *   R005  RECIPIENT_APPROVED    deny  if recipient not on actor's approved list
 *   R006  AMOUNT_WITHIN_LIMIT   APPROVAL_REQUIRED if amount exceeds actor threshold
 *   R007  TREASURY_NOT_RESTRICTED  MANUAL_REVIEW if treasury posture is RESTRICTED
 */

import type { Action, ActionType } from "../schemas/action";
import type { ActorRole, ContextSnapshot, TreasuryPosture } from "../context/loader";
import type { PolicyResult } from "../schemas/policy";

// ── Rule IDs ──────────────────────────────────────────────────────────────────

export const R001 = "R001:RECIPIENT_PRESENT";
export const R002 = "R002:AMOUNT_VALID";
export const R003 = "R003:ACTOR_AUTHORISED";
export const R004 = "R004:TREASURY_NOT_FROZEN";
export const R005 = "R005:RECIPIENT_APPROVED";
export const R006 = "R006:AMOUNT_WITHIN_LIMIT";
export const R007 = "R007:TREASURY_NOT_RESTRICTED";

// Action types that move funds — trigger the full transfer rule set
const TRANSFER_TYPES: Set<ActionType> = new Set(["HBAR_TRANSFER"]);

// Roles permitted to perform any action
const AUTHORISED_ROLES: Set<ActorRole> = new Set(["OPERATOR", "PARTNER", "ADMIN"]);

// ── Individual rule checkers ──────────────────────────────────────────────────
// Each returns null (rule passes) or PolicyResult (rule fires → short-circuit).

type RuleChecker = (action: Action, context: ContextSnapshot) => PolicyResult | null;

function checkRecipientPresent(action: Action, _ctx: ContextSnapshot): PolicyResult | null {
  if (!TRANSFER_TYPES.has(action.actionType)) return null;
  if (!action.recipientId || !action.recipientId.trim()) {
    return {
      decision: "DENIED",
      denialReason: "MISSING_RECIPIENT",
      denialDetail: "A recipient account ID is required for transfer actions.",
      evaluatedRules: [R001],
    };
  }
  return null;
}

function checkAmountValid(action: Action, _ctx: ContextSnapshot): PolicyResult | null {
  if (!TRANSFER_TYPES.has(action.actionType)) return null;
  if (action.amountHbar <= 0) {
    return {
      decision: "DENIED",
      denialReason: "INVALID_AMOUNT",
      denialDetail: `Transfer amount must be greater than zero (received: ${action.amountHbar} HBAR).`,
      evaluatedRules: [R001, R002],
    };
  }
  return null;
}

function checkActorAuthorised(_action: Action, ctx: ContextSnapshot): PolicyResult | null {
  if (!AUTHORISED_ROLES.has(ctx.actorRole)) {
    return {
      decision: "DENIED",
      denialReason: "ACTOR_NOT_AUTHORISED",
      denialDetail: `Actor '${ctx.actorId}' has role '${ctx.actorRole}' which is not permitted. Permitted roles: ${[...AUTHORISED_ROLES].join(", ")}.`,
      evaluatedRules: [R001, R002, R003],
    };
  }
  return null;
}

function checkTreasuryNotFrozen(action: Action, ctx: ContextSnapshot): PolicyResult | null {
  if (!TRANSFER_TYPES.has(action.actionType)) return null;
  if (ctx.treasuryPosture === "FROZEN") {
    return {
      decision: "DENIED",
      denialReason: "TREASURY_FROZEN",
      denialDetail: "Treasury is currently FROZEN. All transfers are suspended until the treasury posture is restored to NORMAL.",
      evaluatedRules: [R001, R002, R003, R004],
    };
  }
  return null;
}

function checkRecipientApproved(action: Action, ctx: ContextSnapshot): PolicyResult | null {
  if (!TRANSFER_TYPES.has(action.actionType)) return null;
  if (!ctx.enforceRecipientAllowlist) return null;
  if (!ctx.approvedRecipients.includes(action.recipientId)) {
    return {
      decision: "DENIED",
      denialReason: "RECIPIENT_NOT_APPROVED",
      denialDetail: `Recipient '${action.recipientId}' is not on the approved list for actor '${ctx.actorId}'. Approved: ${JSON.stringify(ctx.approvedRecipients)}.`,
      evaluatedRules: [R001, R002, R003, R004, R005],
    };
  }
  return null;
}

function checkAmountWithinLimit(action: Action, ctx: ContextSnapshot): PolicyResult | null {
  if (!TRANSFER_TYPES.has(action.actionType)) return null;
  if (action.amountHbar > ctx.amountThresholdHbar) {
    return {
      decision: "APPROVAL_REQUIRED",
      denialReason: "AMOUNT_EXCEEDS_THRESHOLD",
      denialDetail: `Requested amount ${action.amountHbar} HBAR exceeds the threshold of ${ctx.amountThresholdHbar} HBAR for actor '${ctx.actorId}'. Human approval is required before execution.`,
      evaluatedRules: [R001, R002, R003, R004, R005, R006],
    };
  }
  return null;
}

function checkTreasuryNotRestricted(action: Action, ctx: ContextSnapshot): PolicyResult | null {
  if (!TRANSFER_TYPES.has(action.actionType)) return null;
  if (ctx.treasuryPosture === "RESTRICTED") {
    return {
      decision: "MANUAL_REVIEW",
      denialReason: "TREASURY_RESTRICTED",
      denialDetail: "Treasury is currently RESTRICTED. This transfer has been routed to the compliance queue for manual review before execution.",
      evaluatedRules: [R001, R002, R003, R004, R005, R006, R007],
    };
  }
  return null;
}

// ── Rule pipeline ─────────────────────────────────────────────────────────────

const RULES: RuleChecker[] = [
  checkRecipientPresent,      // R001
  checkAmountValid,           // R002
  checkActorAuthorised,       // R003
  checkTreasuryNotFrozen,     // R004
  checkRecipientApproved,     // R005
  checkAmountWithinLimit,     // R006
  checkTreasuryNotRestricted, // R007
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Apply the deterministic clearance rule pipeline to a payout action.
 * Rules are evaluated in order; the first that fires short-circuits.
 * If all rules pass, APPROVED is returned with the full rule trace.
 */
export function evaluatePolicy(action: Action, context: ContextSnapshot): PolicyResult {
  for (const rule of RULES) {
    const result = rule(action, context);
    if (result !== null) return result;
  }

  return {
    decision: "APPROVED",
    denialReason: null,
    denialDetail: "",
    evaluatedRules: _ALL_RULE_IDS,
  };
}

// Backwards-compatible alias
export const evaluate = evaluatePolicy;
