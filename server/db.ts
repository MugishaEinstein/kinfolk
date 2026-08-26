import { and, desc, eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
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
  type InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { storagePut } from "./storage";

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

export async function createOpaqueMessage(input: { familyId: number; roomId: number; authorMemberId: number; clientMessageId: string; ciphertext: string; encryptionScheme: "nip44" | "opaque" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(messages).values({ ...input, relayStatus: "queued" });
  const [message] = await db.select().from(messages).where(eq(messages.clientMessageId, input.clientMessageId)).limit(1);
  if (!message) throw new Error("Message could not be stored");
  await db.insert(relayEvents).values({ familyId: input.familyId, messageId: message.id, eventKind: 14, encryptedPayload: input.ciphertext, status: "queued" });
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
