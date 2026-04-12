/**
 * Ntfy.sh notification integration for pending approvals.
 *
 * Flow:
 *   1. sendApprovalNotification — pushes a notification to the user's phone
 *      with "Approve" / "Deny" action buttons that POST to a unique response topic.
 *   2. pollNtfyForDecision — polls that response topic to see if the user responded.
 *
 * No public server URL is required — responses relay through ntfy.sh itself.
 */

import type { Action } from "../schemas/action";

const NTFY_BASE = "https://ntfy.sh";

export async function sendApprovalNotification(
  notifyTopic: string,
  responseTopic: string,
  action: Action,
  actorRole: string
): Promise<void> {
  const payload = {
    topic: notifyTopic,
    title: "Approval Required — Sika Sentinel",
    message: `${action.rawInstruction}\n\nActor: ${actorRole}  ·  ${action.actorId}`,
    priority: 4,
    tags: ["warning"],
    actions: [
      {
        action: "http",
        label: "Approve",
        url: `${NTFY_BASE}/${responseTopic}`,
        method: "POST",
        body: "APPROVE",
      },
      {
        action: "http",
        label: "Deny",
        url: `${NTFY_BASE}/${responseTopic}`,
        method: "POST",
        body: "DENY",
      },
    ],
  };

  const res = await fetch(NTFY_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Ntfy notification failed: ${res.status} ${res.statusText}`);
  }
}

/**
 * Poll the per-approval ntfy response topic for an APPROVE or DENY message.
 * Returns null if no decision has been made yet.
 */
export async function pollNtfyForDecision(
  responseTopic: string
): Promise<"APPROVE" | "DENY" | null> {
  // since=0 returns all cached messages for this topic from the beginning
  const url = `${NTFY_BASE}/${responseTopic}/json?poll=1&since=0`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const text = await res.text();
    for (const line of text.trim().split("\n")) {
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as { event?: string; message?: string };
        if (parsed.event === "message" && parsed.message) {
          const body = parsed.message.trim().toUpperCase();
          if (body === "APPROVE") return "APPROVE";
          if (body === "DENY") return "DENY";
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // timeout or network error — not fatal
  }

  return null;
}
