import "dotenv/config";
import { PrivateKey } from "@hashgraph/sdk";

const opKey = process.env.HEDERA_OPERATOR_KEY!;
const cleanKey = opKey.replace(/^0x/i, '');

const ed25519 = PrivateKey.fromStringED25519(cleanKey);
const ecdsa = PrivateKey.fromStringECDSA(cleanKey);

console.log("ED25519 public:", ed25519.publicKey.toStringRaw());
console.log("ECDSA public:", ecdsa.publicKey.toStringRaw());
