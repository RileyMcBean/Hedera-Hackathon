import "dotenv/config";
import { PrivateKey } from "@hashgraph/sdk";

const opKey = process.env.HEDERA_OPERATOR_KEY!;
const cleanKey = opKey.replace(/^0x/i, '');

try {
  const pk = PrivateKey.fromStringED25519(cleanKey);
  console.log("Success stringED25519:", pk.toString());
} catch(e: any) {
  console.log("ED25519 failed:", e.message);
}

try {
  const pk = PrivateKey.fromString(cleanKey);
  console.log("Success fromString:", pk.toString());
} catch(e: any) {
  console.log("fromString failed:", e.message);
}
