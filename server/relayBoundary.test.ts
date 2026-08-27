import { finalizeEvent } from "nostr-tools";
import { generateSecretKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { parseRelayedFamilyMessage } from "./relayBoundary";

describe("relay event parsing", () => {
  it("accepts a valid signed Kinfolk family event with opaque ciphertext only", () => {
    const event = finalizeEvent({ kind: 1, created_at: 1_700_000_000, content: "v1.iv.tag.ciphertext", tags: [["t", "kinfolk"], ["f", "4"], ["r", "9"], ["s", "12"], ["client", "client-123"], ["scheme", "opaque"]] }, generateSecretKey());
    expect(parseRelayedFamilyMessage(event)).toMatchObject({ familyId: 4, roomId: 9, senderMemberId: 12, clientMessageId: "client-123", ciphertext: "v1.iv.tag.ciphertext", encryptionScheme: "opaque" });
  });
});
