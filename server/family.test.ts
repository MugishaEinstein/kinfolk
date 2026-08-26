import { describe, expect, it } from "vitest";
import { approvalRequirement, proposalDecision } from "./domain";
import { privateRelayBoundary } from "./relayBoundary";

describe("family governance rules", () => {
  it("uses two approvals by default when two council members exist", () => {
    expect(approvalRequirement(2)).toBe(2);
    expect(approvalRequirement(5)).toBe(2);
  });

  it("keeps a proposal pending until its distinct approvals meet the threshold", () => {
    expect(proposalDecision(1, 0, 2)).toBe("pending");
    expect(proposalDecision(2, 0, 2)).toBe("approved");
  });

  it("keeps the initial relay boundary opaque and safely queued", async () => {
    await expect(privateRelayBoundary.publish({
      familyId: 1,
      roomId: 2,
      senderMemberId: 3,
      ciphertext: "opaque-ciphertext-only",
      encryptionScheme: "opaque",
      clientMessageId: "client-event-1",
      createdAt: new Date(),
    })).resolves.toEqual({ status: "queued" });
  });
});
