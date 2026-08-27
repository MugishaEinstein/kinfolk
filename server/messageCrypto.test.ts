import { describe, expect, it } from "vitest";
import { decryptFamilyMessage, encryptFamilyMessage, getMessageEncryptionStatus } from "./messageCrypto";

describe("family message encryption", () => {
  it("uses the configured key and round-trips private message content", () => {
    const payload = encryptFamilyMessage("A private family message");
    expect(payload).not.toContain("A private family message");
    expect(decryptFamilyMessage(payload)).toBe("A private family message");
    expect(getMessageEncryptionStatus()).toEqual({ algorithm: "AES-256-GCM", version: "v1" });
  });
});
