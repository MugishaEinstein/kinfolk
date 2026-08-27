import { finalizeEvent, getPublicKey, nip19, type VerifiedEvent, verifyEvent } from "nostr-tools";
import { Relay, useWebSocketImplementation } from "nostr-tools/relay";
import WebSocket from "ws";

useWebSocketImplementation(WebSocket);

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
  status: "queued" | "published" | "failed";
  relayEventId?: string;
  relayUrl?: string;
  reason?: string;
};

export type RelayedFamilyMessage = {
  relayEventId: string;
  familyId: number;
  roomId: number;
  senderMemberId: number;
  clientMessageId: string;
  ciphertext: string;
  encryptionScheme: "nip44" | "opaque";
  createdAt: Date;
};

export interface PrivateRelayPublisher {
  publish(event: PrivateRelayEvent): Promise<RelayPublishResult>;
  readRoom(input: { familyId: number; roomId: number; since?: Date }): Promise<RelayedFamilyMessage[]>;
}

function relayUrl() {
  const url = process.env.VITE_NOSTR_RELAY_URL;
  if (!url?.startsWith("wss://")) throw new Error("VITE_NOSTR_RELAY_URL must be a secure WebSocket URL");
  return url;
}

function signingKey() {
  const encoded = process.env.KINFOLK_NOSTR_SECRET_KEY;
  if (!encoded?.startsWith("nsec1")) throw new Error("KINFOLK_NOSTR_SECRET_KEY must be a dedicated nsec key");
  const decoded = nip19.decode(encoded);
  if (decoded.type !== "nsec") throw new Error("KINFOLK_NOSTR_SECRET_KEY is not a Nostr nsec key");
  return decoded.data;
}

export function getRelayPublisherIdentity() {
  return { relayUrl: relayUrl(), pubkey: getPublicKey(signingKey()) };
}

function tagValue(event: VerifiedEvent, name: string) {
  return event.tags.find(tag => tag[0] === name)?.[1];
}

/** Converts only a verified, complete Kinfolk relay event into a local record. */
export function parseRelayedFamilyMessage(event: VerifiedEvent): RelayedFamilyMessage | undefined {
  const familyId = Number(tagValue(event, "f"));
  const roomId = Number(tagValue(event, "r"));
  const senderMemberId = Number(tagValue(event, "s"));
  const clientMessageId = tagValue(event, "client");
  const encryptionScheme = tagValue(event, "scheme");
  if (!Number.isInteger(familyId) || familyId < 1 || !Number.isInteger(roomId) || roomId < 1 || !Number.isInteger(senderMemberId) || senderMemberId < 1 || !clientMessageId || (encryptionScheme !== "opaque" && encryptionScheme !== "nip44")) return undefined;
  return { relayEventId: event.id, familyId, roomId, senderMemberId, clientMessageId, ciphertext: event.content, encryptionScheme, createdAt: new Date(event.created_at * 1000) };
}

async function connectAuthenticatedRelay() {
  const identity = getRelayPublisherIdentity();
  const relay = await Relay.connect(identity.relayUrl, { enablePing: true, enableReconnect: false, idleTimeout: 10_000 });
  await relay.auth(async authTemplate => finalizeEvent(authTemplate, signingKey()));
  return { relay, identity };
}

/** Publishes only opaque content after NIP-42 relay authentication and signature verification. */
export const privateRelayBoundary: PrivateRelayPublisher = {
  async publish(event) {
    const identity = getRelayPublisherIdentity();
    const signedEvent = finalizeEvent({
      kind: 1,
      created_at: Math.floor(event.createdAt.getTime() / 1000),
      tags: [["t", "kinfolk"], ["f", String(event.familyId)], ["r", String(event.roomId)], ["s", String(event.senderMemberId)], ["client", event.clientMessageId], ["scheme", event.encryptionScheme]],
      content: event.ciphertext,
    }, signingKey());
    if (!verifyEvent(signedEvent)) throw new Error("Refused to publish an unverifiable Nostr event");
    let relay: Relay | undefined;
    try {
      relay = (await connectAuthenticatedRelay()).relay;
      await relay.publish(signedEvent);
      return { status: "published", relayEventId: signedEvent.id, relayUrl: identity.relayUrl };
    } catch (error) {
      return { status: "failed", relayEventId: signedEvent.id, relayUrl: identity.relayUrl, reason: error instanceof Error ? error.message : "Relay publication failed" };
    } finally {
      relay?.close();
    }
  },
  async readRoom(input) {
    let relay: Relay | undefined;
    try {
      const connection = await connectAuthenticatedRelay();
      relay = connection.relay;
      return await new Promise<RelayedFamilyMessage[]>((resolve, reject) => {
        const received: RelayedFamilyMessage[] = [];
        const timeout = setTimeout(() => reject(new Error("Timed out while reading the private relay")), 10_000);
        const subscription = relay!.subscribe([{
          kinds: [1], authors: [connection.identity.pubkey], "#f": [String(input.familyId)], "#r": [String(input.roomId)], since: input.since ? Math.floor(input.since.getTime() / 1000) : undefined,
        }], {
          onevent(event) {
            if (!verifyEvent(event)) return;
            const parsed = parseRelayedFamilyMessage(event as VerifiedEvent);
            if (parsed) received.push(parsed);
          },
          oneose() { clearTimeout(timeout); subscription.close(); resolve(received); },
          onclose(reason) { clearTimeout(timeout); reject(new Error(`Private relay closed subscription: ${reason}`)); },
        });
      });
    } finally {
      relay?.close();
    }
  },
};
