import { getPublicKey, nip19 } from "nostr-tools";

const nsec = process.env.KINFOLK_NOSTR_SECRET_KEY;
if (!nsec?.startsWith("nsec1")) {
  throw new Error("Set KINFOLK_NOSTR_SECRET_KEY to a dedicated nsec before deriving the relay public key.");
}
const decoded = nip19.decode(nsec);
if (decoded.type !== "nsec") throw new Error("KINFOLK_NOSTR_SECRET_KEY is not a valid nsec.");
console.log(getPublicKey(decoded.data));
