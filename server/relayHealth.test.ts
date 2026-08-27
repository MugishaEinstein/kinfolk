import { afterEach, describe, expect, it, vi } from "vitest";
import { getRelayHealth } from "./relayHealth";

describe("relay health", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts a matching Nostr information document from a secure relay", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "wss://relay.nostr.africa/", name: "Kinfolk Private Relay", software: "nostr-rs-relay" }), { status: 200 })));
    await expect(getRelayHealth("wss://relay.nostr.africa")).resolves.toMatchObject({ status: "online", name: "Kinfolk Private Relay" });
  });

  it("reports an offline relay without exposing internal transport errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    await expect(getRelayHealth("wss://relay.nostr.africa")).resolves.toMatchObject({ status: "offline", detail: "The private relay could not be reached from Kinfolk." });
  });
});
