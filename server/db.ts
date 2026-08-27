import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import {
  chatRooms,
  families,
  familyActivity,
  familyMembers,
  familyRelationships,
  governanceVotes,
  governanceProposals,
  invitationApprovals,
  invitations,
  mediaAssets,
  memberNotifications,
  messages,
  relayEvents,
  webauthnChallenges,
  webauthnCredentials,
  type InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { storagePut } from "./storage";
import { decryptFamilyMessage } from "./messageCrypto";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  (["name", "email", "loginMethod"] as const).forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function createPasskeyUser(input: { displayName: string; email?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const openId = `passkey-${randomUUID()}`;
  await db.insert(users).values({ openId, name: input.displayName, email: input.email ?? null, loginMethod: "passkey", lastSignedIn: new Date() });
  const user = await getUserByOpenId(openId);
  if (!user) throw new Error("Passkey account could not be created");
  return user;
}

export async function createWebAuthnChallenge(input: { id: string; ceremony: "registration" | "authentication"; challenge: string; displayName?: string; email?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(webauthnChallenges).values({ ...input, displayName: input.displayName ?? null, email: input.email ?? null, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
}

export async function consumeWebAuthnChallenge(id: string, ceremony: "registration" | "authentication") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.select().from(webauthnChallenges).where(and(eq(webauthnChallenges.id, id), eq(webauthnChallenges.ceremony, ceremony), isNull(webauthnChallenges.consumedAt), gt(webauthnChallenges.expiresAt, new Date()))).limit(1);
  const challenge = result[0];
  if (!challenge) return undefined;
  await db.update(webauthnChallenges).set({ consumedAt: new Date() }).where(and(eq(webauthnChallenges.id, id), isNull(webauthnChallenges.consumedAt)));
  return challenge;
}

export async function storeWebAuthnCredential(input: { userId: number; credentialId: string; publicKey: string; counter: number; transports: string[]; deviceType: string; backedUp: boolean; aaguid?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(webauthnCredentials).values({ ...input, transports: input.transports, backedUp: input.backedUp ? 1 : 0, aaguid: input.aaguid ?? null });
}

export async function getWebAuthnCredentialById(credentialId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.credentialId, credentialId)).limit(1);
  return result[0];
}

export async function updateWebAuthnCredentialUse(id: number, counter: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(webauthnCredentials).set({ counter, lastUsedAt: new Date() }).where(eq(webauthnCredentials.id, id));
}

export async function getMembership(familyId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(familyMembers).where(and(
    eq(familyMembers.familyId, familyId),
    eq(familyMembers.userId, userId),
    eq(familyMembers.status, "active"),
  )).limit(1);
  return result[0];
}

export async function getCouncilMemberCount(familyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [council] = await db.select({ value: count() }).from(familyMembers).where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.status, "active"), eq(familyMembers.role, "council")));
  const [admins] = await db.select({ value: count() }).from(familyMembers).where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.status, "active"), eq(familyMembers.role, "admin")));
  return council.value + admins.value;
}

export async function createFamilyWithFounder(input: { userId: number; name: string; slug: string; description?: string; founderName: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(families).values({ name: input.name, slug: input.slug, description: input.description ?? null });
  const [family] = await db.select().from(families).where(eq(families.slug, input.slug)).limit(1);
  if (!family) throw new Error("Family could not be created");
  await db.insert(familyMembers).values({
    familyId: family.id,
    userId: input.userId,
    displayName: input.founderName,
    membershipType: "nuclear",
    role: "admin",
    status: "active",
  });
  const [founder] = await db.select().from(familyMembers).where(and(eq(familyMembers.familyId, family.id), eq(familyMembers.userId, input.userId))).limit(1);
  if (!founder) throw new Error("Family founder could not be created");
  await db.insert(chatRooms).values([
    { familyId: family.id, name: "Family general", description: "The common room for the household", kind: "general", accessLevel: "family", createdByMemberId: founder.id },
    { familyId: family.id, name: "Nuclear family", description: "A private room for the nuclear family", kind: "nuclear", accessLevel: "nuclear", createdByMemberId: founder.id },
    { familyId: family.id, name: "Announcements", description: "Important household notices", kind: "announcements", accessLevel: "family", createdByMemberId: founder.id },
  ]);
  await db.insert(familyActivity).values({ familyId: family.id, actorMemberId: founder.id, type: "family_created", message: "Created this private family home." });
  return family;
}

export async function getFamilyDashboard(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const memberships = await db.select({ family: families, member: familyMembers })
    .from(familyMembers)
    .innerJoin(families, eq(familyMembers.familyId, families.id))
    .where(and(eq(familyMembers.userId, userId), eq(familyMembers.status, "active")))
    .limit(1);
  const membership = memberships[0];
  if (!membership) return undefined;
  const familyId = membership.family.id;
  const [members, relationships, rooms, pendingInvitations, openProposals, notifications, activity, latestMessages] = await Promise.all([
    db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId)),
    db.select().from(familyRelationships).where(eq(familyRelationships.familyId, familyId)),
    db.select().from(chatRooms).where(eq(chatRooms.familyId, familyId)),
    db.select().from(invitations).where(and(eq(invitations.familyId, familyId), eq(invitations.status, "pending_approval"))),
    db.select().from(governanceProposals).where(and(eq(governanceProposals.familyId, familyId), eq(governanceProposals.status, "open"))),
    db.select().from(memberNotifications).where(and(eq(memberNotifications.memberId, membership.member.id), isNull(memberNotifications.readAt))),
    db.select().from(familyActivity).where(eq(familyActivity.familyId, familyId)).orderBy(desc(familyActivity.createdAt)).limit(12),
    db.select().from(messages).where(eq(messages.familyId, familyId)).orderBy(desc(messages.sentAt)).limit(20),
  ]);
  return { family: membership.family, membership: membership.member, members, relationships, rooms, pendingInvitations, openProposals, notifications, activity, latestMessages: latestMessages.reverse() };
}

export async function getRoomMessages(familyId: number, roomId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select({ message: messages, author: familyMembers })
    .from(messages)
    .innerJoin(familyMembers, eq(messages.authorMemberId, familyMembers.id))
    .where(and(eq(messages.familyId, familyId), eq(messages.roomId, roomId), isNull(messages.deletedAt)))
    .orderBy(messages.sentAt)
    .limit(200);
  return rows.map(({ message, author }) => ({
    id: message.id,
    roomId: message.roomId,
    authorMemberId: message.authorMemberId,
    authorName: author.displayName,
    authorPhotoUrl: author.photoUrl,
    content: decryptFamilyMessage(message.ciphertext),
    relayStatus: message.relayStatus,
    relayEventId: message.relayEventId,
    sentAt: message.sentAt,
  }));
}

export async function storeRelayedMessage(input: { relayEventId: string; familyId: number; roomId: number; authorMemberId: number; clientMessageId: string; ciphertext: string; encryptionScheme: "nip44" | "opaque"; createdAt: Date; relayUrl: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [existing] = await db.select().from(messages).where(eq(messages.clientMessageId, input.clientMessageId)).limit(1);
  if (existing) return { stored: false, messageId: existing.id };
  const [member] = await db.select().from(familyMembers).where(and(eq(familyMembers.id, input.authorMemberId), eq(familyMembers.familyId, input.familyId), eq(familyMembers.status, "active"))).limit(1);
  if (!member) return { stored: false, messageId: undefined };
  await db.insert(messages).values({ familyId: input.familyId, roomId: input.roomId, authorMemberId: input.authorMemberId, clientMessageId: input.clientMessageId, ciphertext: input.ciphertext, encryptionScheme: input.encryptionScheme, relayStatus: "published", relayEventId: input.relayEventId, sentAt: input.createdAt });
  const [message] = await db.select().from(messages).where(eq(messages.clientMessageId, input.clientMessageId)).limit(1);
  if (!message) throw new Error("Relayed message could not be stored");
  await db.insert(relayEvents).values({ familyId: input.familyId, messageId: message.id, nostrEventId: input.relayEventId, relayUrl: input.relayUrl, eventKind: 1, encryptedPayload: input.ciphertext, status: "published" });
  return { stored: true, messageId: message.id };
}

export async function createOpaqueMessage(input: { familyId: number; roomId: number; authorMemberId: number; clientMessageId: string; ciphertext: string; encryptionScheme: "nip44" | "opaque"; relayStatus: "queued" | "published" | "failed"; relayEventId?: string; relayUrl?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(messages).values({
    familyId: input.familyId,
    roomId: input.roomId,
    authorMemberId: input.authorMemberId,
    clientMessageId: input.clientMessageId,
    ciphertext: input.ciphertext,
    encryptionScheme: input.encryptionScheme,
    relayStatus: input.relayStatus,
    relayEventId: input.relayEventId ?? null,
  });
  const [message] = await db.select().from(messages).where(eq(messages.clientMessageId, input.clientMessageId)).limit(1);
  if (!message) throw new Error("Message could not be stored");
  await db.insert(relayEvents).values({ familyId: input.familyId, messageId: message.id, nostrEventId: input.relayEventId ?? null, relayUrl: input.relayUrl ?? null, eventKind: 1, encryptedPayload: input.ciphertext, status: input.relayStatus });
  return message;
}

export async function createFamilyInvitation(input: { familyId: number; requestedByMemberId: number; inviteeName: string; inviteeEmail: string; membershipType: "nuclear" | "extended" | "external"; requestedRole?: string; requiredApprovals: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const invitationToken = createHash("sha256").update(`${nanoidSeed()}-${Date.now()}`).digest("hex");
  const tokenDigest = createHash("sha256").update(invitationToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(invitations).values({
    familyId: input.familyId,
    requestedByMemberId: input.requestedByMemberId,
    inviteeName: input.inviteeName,
    inviteeEmail: input.inviteeEmail.toLowerCase(),
    membershipType: input.membershipType,
    requestedRole: input.requestedRole ?? null,
    tokenDigest,
    status: "sent",
    requiredApprovals: input.requiredApprovals,
    expiresAt,
  });
  const [invitation] = await db.select().from(invitations).where(and(eq(invitations.familyId, input.familyId), eq(invitations.tokenDigest, tokenDigest))).limit(1);
  if (!invitation) throw new Error("Invitation could not be created");
  await db.insert(familyActivity).values({ familyId: input.familyId, actorMemberId: input.requestedByMemberId, type: "invitation_created", message: `Prepared a private invitation for ${input.inviteeName}.` });
  return { invitation, invitationToken };
}

export async function acceptFamilyInvitation(input: { invitationToken: string; userId: number; displayName: string; email?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const tokenDigest = createHash("sha256").update(input.invitationToken).digest("hex");
  const [invitation] = await db.select().from(invitations).where(and(eq(invitations.tokenDigest, tokenDigest), gt(invitations.expiresAt, new Date()))).limit(1);
  if (!invitation || invitation.status === "rejected" || invitation.status === "expired") throw new Error("This invitation is not available");
  await db.insert(familyMembers).values({ familyId: invitation.familyId, userId: input.userId, displayName: input.displayName, email: input.email ?? invitation.inviteeEmail, membershipType: invitation.membershipType, relationshipLabel: invitation.requestedRole ?? null, status: "pending" }).onDuplicateKeyUpdate({ set: { displayName: input.displayName, email: input.email ?? invitation.inviteeEmail, status: "pending" } });
  await db.update(invitations).set({ acceptedUserId: input.userId, status: "pending_approval" }).where(eq(invitations.id, invitation.id));
  const council = await db.select().from(familyMembers).where(and(eq(familyMembers.familyId, invitation.familyId), eq(familyMembers.status, "active")));
  const notifications = council.filter(member => member.id !== invitation.requestedByMemberId && ["admin", "council"].includes(member.role)).map(member => ({ familyId: invitation.familyId, memberId: member.id, type: "invitation" as const, title: "A membership request needs your acknowledgement", body: `${input.displayName} accepted a private family invitation.`, targetPath: "/" }));
  if (notifications.length) await db.insert(memberNotifications).values(notifications);
  await db.insert(familyActivity).values({ familyId: invitation.familyId, actorMemberId: null, type: "invitation_accepted", message: `${input.displayName} accepted a private family invitation.` });
  return { familyId: invitation.familyId, invitationId: invitation.id, status: "pending_approval" as const };
}

export async function decideInvitation(input: { invitationId: number; memberId: number; decision: "approve" | "reject" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [invitation] = await db.select().from(invitations).where(eq(invitations.id, input.invitationId)).limit(1);
  if (!invitation) throw new Error("Invitation not found");
  await db.insert(invitationApprovals).values(input).onDuplicateKeyUpdate({ set: { decision: input.decision } });
  const approvals = await db.select().from(invitationApprovals).where(and(eq(invitationApprovals.invitationId, invitation.id), eq(invitationApprovals.decision, "approve")));
  const rejections = await db.select().from(invitationApprovals).where(and(eq(invitationApprovals.invitationId, invitation.id), eq(invitationApprovals.decision, "reject")));
  const status = approvals.length >= invitation.requiredApprovals ? "approved" : rejections.length >= invitation.requiredApprovals ? "rejected" : "pending_approval";
  await db.update(invitations).set({ status }).where(eq(invitations.id, invitation.id));
  if (status === "approved" && invitation.acceptedUserId) {
    await db.update(familyMembers).set({ status: "active" }).where(and(eq(familyMembers.familyId, invitation.familyId), eq(familyMembers.userId, invitation.acceptedUserId)));
  }
  await db.insert(familyActivity).values({ familyId: invitation.familyId, actorMemberId: input.memberId, type: "invitation_reviewed", message: `${input.decision === "approve" ? "Acknowledged" : "Declined"} the invitation for ${invitation.inviteeName}.` });
  return { status, approvals: approvals.length, rejections: rejections.length, requiredApprovals: invitation.requiredApprovals };
}

export async function createGovernanceProposal(input: { familyId: number; createdByMemberId: number; title: string; summary: string; category: "membership" | "home" | "event" | "policy" | "other"; requiredApprovals: number; closesAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(governanceProposals).values({ ...input, closesAt: input.closesAt ?? null });
  const [proposal] = await db.select().from(governanceProposals).where(and(eq(governanceProposals.familyId, input.familyId), eq(governanceProposals.title, input.title))).orderBy(desc(governanceProposals.createdAt)).limit(1);
  if (!proposal) throw new Error("Proposal could not be created");
  await db.insert(familyActivity).values({ familyId: input.familyId, actorMemberId: input.createdByMemberId, type: "proposal_created", message: `Opened the decision: ${input.title}` });
  return proposal;
}

export async function voteOnProposal(input: { proposalId: number; memberId: number; decision: "approve" | "acknowledge" | "reject"; note?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [proposal] = await db.select().from(governanceProposals).where(eq(governanceProposals.id, input.proposalId)).limit(1);
  if (!proposal) throw new Error("Proposal not found");
  await db.insert(governanceVotes).values({ ...input, note: input.note ?? null }).onDuplicateKeyUpdate({ set: { decision: input.decision, note: input.note ?? null } });
  const approvals = await db.select().from(governanceVotes).where(and(eq(governanceVotes.proposalId, proposal.id), eq(governanceVotes.decision, "approve")));
  const rejections = await db.select().from(governanceVotes).where(and(eq(governanceVotes.proposalId, proposal.id), eq(governanceVotes.decision, "reject")));
  const status = approvals.length >= proposal.requiredApprovals ? "approved" : rejections.length >= proposal.requiredApprovals ? "rejected" : "open";
  await db.update(governanceProposals).set({ status }).where(eq(governanceProposals.id, proposal.id));
  await db.insert(familyActivity).values({ familyId: proposal.familyId, actorMemberId: input.memberId, type: "proposal_voted", message: `Recorded a ${input.decision} response for ${proposal.title}.` });
  return { status, approvals: approvals.length, rejections: rejections.length, requiredApprovals: proposal.requiredApprovals };
}

export async function storeFamilyAttachment(input: { familyId: number; uploadedByMemberId: number; fileName: string; mimeType: string; base64: string; targetType: "profile" | "relationship" | "message" | "family"; targetId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const bytes = Buffer.from(input.base64, "base64");
  const { key, url } = await storagePut(`families/${input.familyId}/${input.targetType}/${input.fileName}`, bytes, input.mimeType);
  await db.insert(mediaAssets).values({ familyId: input.familyId, uploadedByMemberId: input.uploadedByMemberId, storageKey: key, storageUrl: url, fileName: input.fileName, mimeType: input.mimeType, targetType: input.targetType, targetId: input.targetId });
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.storageKey, key)).limit(1);
  if (!asset) throw new Error("Attachment metadata could not be saved");
  return asset;
}

/** Generates local entropy without ever persisting the raw invitation token. */
function nanoidSeed() {
  return `${process.hrtime.bigint()}-${Math.random()}-${process.pid}`;
}
