/**
 * The application only passes opaque encrypted content across this boundary.
 * A Nostr adapter can be added later without changing the family/chat domain API.
 */
export type PrivateRelayEvent = {
  familyId: number;
  roomId: number;
  senderMemberId: number;
  ciphertext: string;
  encryptionScheme: "nip44" | "opaque";
  clientMessageId: string;
  createdAt: Date;
};

export type RelayPublishResult = {
  status: "queued" | "published";
  relayEventId?: string;
};

export interface PrivateRelayPublisher {
  publish(event: PrivateRelayEvent): Promise<RelayPublishResult>;
}

/**
 * Safe initial adapter: it never forwards plaintext or keys, and lets the
 * persistence layer record an opaque outbound event until a relay is enabled.
 */
export const privateRelayBoundary: PrivateRelayPublisher = {
  async publish() {
    return { status: "queued" };
  },
};
