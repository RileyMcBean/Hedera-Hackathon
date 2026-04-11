/**
 * Seed the context store with demo actors.
 * Run: npx tsx scripts/seedContext.ts
 */

import fs from "fs";
import path from "path";

const store = {
  treasury: { posture: "NORMAL" },
  actors: {
    "0.0.100": {
      role: "OPERATOR",
      partner_id: "partner-alpha",
      amount_threshold_hbar: 100.0,
      approved_recipients: ["0.0.800", "0.0.801"],
      enforce_recipient_allowlist: true,
    },
    "0.0.200": {
      role: "PARTNER",
      partner_id: "partner-beta",
      amount_threshold_hbar: 25.0,
      approved_recipients: ["0.0.800"],
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

const outPath = path.resolve(__dirname, "context_store.json");
fs.writeFileSync(outPath, JSON.stringify(store, null, 2), "utf-8");
console.log(`Context store written to ${outPath}`);
