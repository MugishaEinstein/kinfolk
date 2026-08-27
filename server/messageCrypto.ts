import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const version = "v1";

function key() {
  const configured = process.env.KINFOLK_MESSAGE_ENCRYPTION_KEY;
  if (!configured) throw new Error("KINFOLK_MESSAGE_ENCRYPTION_KEY is required");
  const decoded = Buffer.from(configured, "base64");
  if (decoded.length !== 32) throw new Error("KINFOLK_MESSAGE_ENCRYPTION_KEY must decode to 32 bytes");
  return decoded;
}

export function getMessageEncryptionStatus() {
  key();
  return { algorithm: "AES-256-GCM", version } as const;
}

/** Encrypts UTF-8 message content before persistence. The database sees only versioned ciphertext. */
export function encryptFamilyMessage(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [version, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptFamilyMessage(payload: string) {
  const [payloadVersion, iv, tag, ciphertext] = payload.split(".");
  if (payloadVersion !== version || !iv || !tag || !ciphertext) throw new Error("Invalid encrypted Kinfolk message");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
