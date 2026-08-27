import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const dbMocks = vi.hoisted(() => ({
  createFamilyWithFounder: vi.fn(),
  acceptFamilyInvitation: vi.fn(),
  createOpaqueMessage: vi.fn(),
  getFamilyDashboard: vi.fn(),
  getMembership: vi.fn(),
  getRetryableRoomMessages: vi.fn(),
  getRoomMessages: vi.fn(),
  createFamilyInvitation: vi.fn(),
  getCouncilMemberCount: vi.fn(),
  createGovernanceProposal: vi.fn(),
  decideInvitation: vi.fn(),
  storeFamilyAttachment: vi.fn(),
  storeRelayedMessage: vi.fn(),
  updateMessageRelayDelivery: vi.fn(),
  voteOnProposal: vi.fn(),
}));

const relayMocks = vi.hoisted(() => ({ publish: vi.fn(), readRoom: vi.fn() }));

vi.mock("./db", () => dbMocks);
vi.mock("./relayBoundary", () => ({ privateRelayBoundary: relayMocks }));

import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function context(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 7,
    openId: "calder-user",
    email: "arthur@example.com",
    name: "Arthur Calder",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("protected Kinfolk router workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getRetryableRoomMessages.mockResolvedValue([]);
  });

  it("creates a family with a normalized private home slug", async () => {
    dbMocks.createFamilyWithFounder.mockResolvedValue({ id: 22, name: "Calder Home" });
    const caller = appRouter.createCaller(context());

    const result = await caller.family.bootstrap({ name: "Calder Home", description: "A quiet private place." });

    expect(result).toEqual({ id: 22, name: "Calder Home" });
    expect(dbMocks.createFamilyWithFounder).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      name: "Calder Home",
      founderName: "Arthur Calder",
      slug: expect.stringMatching(/^calder-home-[a-z0-9]{6}$/),
    }));
  });

  it("accepts only an active member's opaque message and queues the relay boundary", async () => {
    dbMocks.getMembership.mockResolvedValue({ id: 31, role: "member" });
    relayMocks.publish.mockResolvedValue({ status: "queued" });
    dbMocks.createOpaqueMessage.mockResolvedValue({ id: 92, relayStatus: "queued" });
    const caller = appRouter.createCaller(context());

    const result = await caller.family.sendOpaqueMessage({
      familyId: 22, roomId: 9, clientMessageId: "message-client-0001", ciphertext: "opaque-payload", encryptionScheme: "opaque",
    });

    expect(relayMocks.publish).toHaveBeenCalledWith(expect.objectContaining({ senderMemberId: 31, ciphertext: "opaque-payload" }));
    expect(dbMocks.createOpaqueMessage).toHaveBeenCalledWith(expect.objectContaining({ authorMemberId: 31, roomId: 9 }));
    expect(result).toEqual({ message: { id: 92, relayStatus: "queued" }, relayStatus: "queued" });
  });

  it("encrypts real room content before the signed relay publisher and database see it", async () => {
    dbMocks.getMembership.mockResolvedValue({ id: 31, role: "member" });
    relayMocks.publish.mockResolvedValue({ status: "published", relayEventId: "relay-55", relayUrl: "wss://relay.nostr.africa" });
    dbMocks.createOpaqueMessage.mockResolvedValue({ id: 93, relayStatus: "published" });
    const caller = appRouter.createCaller(context());

    await expect(caller.family.sendMessage({ familyId: 22, roomId: 9, content: "Bring the family album." })).resolves.toMatchObject({ relayStatus: "published", relayEventId: "relay-55" });
    const relayInput = relayMocks.publish.mock.calls[0]?.[0];
    expect(relayInput.ciphertext).not.toContain("Bring the family album.");
    expect(relayInput.ciphertext).toMatch(/^v1\./);
    expect(dbMocks.createOpaqueMessage).toHaveBeenCalledWith(expect.objectContaining({ relayStatus: "published", relayEventId: "relay-55" }));
  });

  it("requires a council role before a family invitation can be created", async () => {
    dbMocks.getMembership.mockResolvedValue({ id: 31, role: "council" });
    dbMocks.getCouncilMemberCount.mockResolvedValue(2);
    dbMocks.createFamilyInvitation.mockResolvedValue({ invitation: { id: 3 }, invitationToken: "never-return-this-to-a-log" });
    const caller = appRouter.createCaller(context());

    await caller.family.invite({ familyId: 22, inviteeName: "Marin Torres", inviteeEmail: "marin@example.com", membershipType: "external" });

    expect(dbMocks.createFamilyInvitation).toHaveBeenCalledWith(expect.objectContaining({ requestedByMemberId: 31, requiredApprovals: 2 }));
  });

  it("accepts a private invite only for the authenticated passkey account", async () => {
    dbMocks.acceptFamilyInvitation.mockResolvedValue({ familyId: 22, invitationId: 5, status: "pending_approval" });
    const caller = appRouter.createCaller(context());

    await expect(caller.family.acceptInvitation({ invitationToken: "a".repeat(64) })).resolves.toEqual({ familyId: 22, invitationId: 5, status: "pending_approval" });
    expect(dbMocks.acceptFamilyInvitation).toHaveBeenCalledWith({ invitationToken: "a".repeat(64), userId: 7, displayName: "Arthur Calder", email: "arthur@example.com" });
  });

  it("synchronizes only authenticated family-room events from the private relay", async () => {
    dbMocks.getMembership.mockResolvedValue({ id: 31, role: "member" });
    relayMocks.readRoom.mockResolvedValue([{ relayEventId: "relay-1", familyId: 22, roomId: 9, senderMemberId: 31, clientMessageId: "client-1", ciphertext: "v1.iv.tag.payload", encryptionScheme: "opaque", createdAt: new Date() }]);
    dbMocks.storeRelayedMessage.mockResolvedValue({ stored: true, messageId: 40 });
    const caller = appRouter.createCaller(context());

    await expect(caller.family.syncRoomFromRelay({ familyId: 22, roomId: 9 })).resolves.toEqual({ received: 1, stored: 1, retried: 0 });
    expect(dbMocks.storeRelayedMessage).toHaveBeenCalledWith(expect.objectContaining({ relayEventId: "relay-1", authorMemberId: 31, relayUrl: "wss://relay.nostr.africa" }));
  });

  it("returns the current member's private family dashboard only through the protected procedure", async () => {
    dbMocks.getFamilyDashboard.mockResolvedValue({ family: { id: 22, name: "Calder Home" }, members: [] });
    const caller = appRouter.createCaller(context());

    await expect(caller.family.dashboard()).resolves.toEqual({ family: { id: 22, name: "Calder Home" }, members: [] });
    expect(dbMocks.getFamilyDashboard).toHaveBeenCalledWith(7);
  });

  it("routes council reviews and decisions through their durable domain operations", async () => {
    dbMocks.getMembership.mockResolvedValue({ id: 31, role: "admin" });
    dbMocks.decideInvitation.mockResolvedValue({ status: "approved", approvals: 2, rejections: 0, requiredApprovals: 2 });
    dbMocks.createGovernanceProposal.mockResolvedValue({ id: 55, title: "Family picnic" });
    dbMocks.voteOnProposal.mockResolvedValue({ status: "approved", approvals: 2, rejections: 0, requiredApprovals: 2 });
    const caller = appRouter.createCaller(context());

    await caller.family.reviewInvitation({ invitationId: 8, familyId: 22, decision: "approve" });
    await caller.governance.create({ familyId: 22, title: "Family picnic", summary: "Confirm the September date.", category: "event" });
    await caller.governance.vote({ proposalId: 55, familyId: 22, decision: "approve" });

    expect(dbMocks.decideInvitation).toHaveBeenCalledWith({ invitationId: 8, memberId: 31, decision: "approve" });
    expect(dbMocks.createGovernanceProposal).toHaveBeenCalledWith(expect.objectContaining({ createdByMemberId: 31, requiredApprovals: 2 }));
    expect(dbMocks.voteOnProposal).toHaveBeenCalledWith(expect.objectContaining({ proposalId: 55, memberId: 31, decision: "approve" }));
  });

  it("authorizes attachment metadata under an active family membership", async () => {
    dbMocks.getMembership.mockResolvedValue({ id: 31, role: "member" });
    dbMocks.storeFamilyAttachment.mockResolvedValue({ id: 4, storageKey: "families/22/message/photo.png" });
    const caller = appRouter.createCaller(context());

    await caller.family.storeAttachment({ familyId: 22, fileName: "photo.png", mimeType: "image/png", base64: "aGVsbG8=", targetType: "message", targetId: 9 });

    expect(dbMocks.storeFamilyAttachment).toHaveBeenCalledWith(expect.objectContaining({ familyId: 22, uploadedByMemberId: 31, targetType: "message" }));
  });
});
