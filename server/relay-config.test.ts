import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context: TrpcContext = {
  user: null,
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
};

describe("relay runtime configuration", () => {
  it("serves the configured secure private-relay and WebAuthn endpoints through a lightweight endpoint", async () => {
    const caller = appRouter.createCaller(context);
    const result = await caller.relay.config();

    expect(result).toMatchObject({ relayUrl: "wss://relay.nostr.africa", rpId: "chat.nostr.africa", origin: "https://chat.nostr.africa", messageEncryption: { algorithm: "AES-256-GCM", version: "v1" } });
    expect(result.pubkey).toMatch(/^[a-f0-9]{64}$/);
  });
});
