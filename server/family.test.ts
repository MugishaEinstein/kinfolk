import { describe, expect, it } from "vitest";
import { approvalRequirement, proposalDecision } from "./domain";
import { getRelayPublisherIdentity } from "./relayBoundary";

describe("family governance rules", () => {
  it("uses two approvals by default when two council members exist", () => {
    expect(approvalRequirement(2)).toBe(2);
    expect(approvalRequirement(5)).toBe(2);
  });

  it("keeps a proposal pending until its distinct approvals meet the threshold", () => {
    expect(proposalDecision(1, 0, 2)).toBe("pending");
    expect(proposalDecision(2, 0, 2)).toBe("approved");
  });

  it("derives a public publisher identity from the dedicated private relay key", () => {
    const identity = getRelayPublisherIdentity();
    expect(identity.relayUrl).toBe("wss://relay.nostr.africa");
    expect(identity.pubkey).toMatch(/^[a-f0-9]{64}$/);
  });
});
