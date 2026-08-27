import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { acceptFamilyInvitation, createFamilyInvitation, createFamilyWithFounder, createGovernanceProposal, createOpaqueMessage, decideInvitation, getCouncilMemberCount, getFamilyDashboard, getMembership, getRoomMessages, storeFamilyAttachment, storeRelayedMessage, voteOnProposal } from "./db";
import { approvalRequirement } from "./domain";
import { privateRelayBoundary } from "./relayBoundary";
import { getRelayPublisherIdentity } from "./relayBoundary";
import { finishPasskeyAuthentication, finishPasskeyRegistration, startPasskeyAuthentication, startPasskeyRegistration } from "./webauthn";
import { getMessageEncryptionStatus } from "./messageCrypto";
import { encryptFamilyMessage } from "./messageCrypto";

export const appRouter = router({
  system: systemRouter,
  relay: router({
    config: publicProcedure.query(() => {
      const rpId = process.env.VITE_WEBAUTHN_RP_ID;
      const origin = process.env.VITE_WEBAUTHN_ORIGIN;
      if (!rpId || !origin) throw new Error("Kinfolk relay and passkey configuration is incomplete");
      if (!origin.startsWith("https://")) throw new Error("Kinfolk production endpoints must use secure protocols");
      return { ...getRelayPublisherIdentity(), rpId, origin, messageEncryption: getMessageEncryptionStatus() };
    }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    startPasskeyRegistration: publicProcedure.input(z.object({ displayName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(320).optional() })).mutation(({ input }) => startPasskeyRegistration(input)),
    finishPasskeyRegistration: publicProcedure.input(z.object({ challengeId: z.string().uuid(), response: z.any() })).mutation(({ input, ctx }) => finishPasskeyRegistration({ ...input, ctx })),
    startPasskeyAuthentication: publicProcedure.mutation(() => startPasskeyAuthentication()),
    finishPasskeyAuthentication: publicProcedure.input(z.object({ challengeId: z.string().uuid(), response: z.any() })).mutation(({ input, ctx }) => finishPasskeyAuthentication({ ...input, ctx })),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  family: router({
    dashboard: protectedProcedure.query(async ({ ctx }) => getFamilyDashboard(ctx.user.id)),
    roomMessages: protectedProcedure.input(z.object({ familyId: z.number().int().positive(), roomId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await getMembership(input.familyId, ctx.user.id);
      if (!membership) throw new Error("You do not have access to this family");
      return getRoomMessages(input.familyId, input.roomId);
    }),
    bootstrap: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).optional() }))
      .mutation(async ({ ctx, input }) => {
        const suffix = nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, "a");
        const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${suffix}`;
        return createFamilyWithFounder({ userId: ctx.user.id, name: input.name, slug, description: input.description, founderName: ctx.user.name ?? "Family member" });
      }),
    sendOpaqueMessage: protectedProcedure.input(z.object({
      familyId: z.number().int().positive(), roomId: z.number().int().positive(), clientMessageId: z.string().min(8).max(100), ciphertext: z.string().min(1), encryptionScheme: z.enum(["nip44", "opaque"]),
    })).mutation(async ({ ctx, input }) => {
      const membership = await getMembership(input.familyId, ctx.user.id);
      if (!membership) throw new Error("You do not have access to this family");
      const relayResult = await privateRelayBoundary.publish({ ...input, senderMemberId: membership.id, createdAt: new Date() });
      const message = await createOpaqueMessage({ ...input, authorMemberId: membership.id, relayStatus: relayResult.status, relayEventId: relayResult.relayEventId, relayUrl: relayResult.relayUrl });
      return { message, relayStatus: relayResult.status };
    }),
    sendMessage: protectedProcedure.input(z.object({ familyId: z.number().int().positive(), roomId: z.number().int().positive(), content: z.string().trim().min(1).max(10_000) })).mutation(async ({ ctx, input }) => {
      const membership = await getMembership(input.familyId, ctx.user.id);
      if (!membership) throw new Error("You do not have access to this family");
      const clientMessageId = nanoid(24);
      const ciphertext = encryptFamilyMessage(input.content);
      const relayResult = await privateRelayBoundary.publish({ familyId: input.familyId, roomId: input.roomId, senderMemberId: membership.id, clientMessageId, ciphertext, encryptionScheme: "opaque", createdAt: new Date() });
      const message = await createOpaqueMessage({ familyId: input.familyId, roomId: input.roomId, authorMemberId: membership.id, clientMessageId, ciphertext, encryptionScheme: "opaque", relayStatus: relayResult.status, relayEventId: relayResult.relayEventId, relayUrl: relayResult.relayUrl });
      return { message, relayStatus: relayResult.status, relayEventId: relayResult.relayEventId };
    }),
    syncRoomFromRelay: protectedProcedure.input(z.object({ familyId: z.number().int().positive(), roomId: z.number().int().positive(), since: z.coerce.date().optional() })).mutation(async ({ ctx, input }) => {
      const membership = await getMembership(input.familyId, ctx.user.id);
      if (!membership) throw new Error("You do not have access to this family");
      const relayedMessages = await privateRelayBoundary.readRoom(input);
      const results = await Promise.all(relayedMessages.map(event => storeRelayedMessage({ ...event, authorMemberId: event.senderMemberId, relayUrl: process.env.VITE_NOSTR_RELAY_URL! })));
      return { received: relayedMessages.length, stored: results.filter(result => result.stored).length };
    }),
    invite: protectedProcedure.input(z.object({
      familyId: z.number().int().positive(), inviteeName: z.string().trim().min(2).max(120), inviteeEmail: z.string().trim().email(), membershipType: z.enum(["nuclear", "extended", "external"]), requestedRole: z.string().trim().max(100).optional(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await getMembership(input.familyId, ctx.user.id);
      if (!membership || !["admin", "council"].includes(membership.role)) throw new Error("Only the family council can create an invitation");
      const eligibleCouncil = await getCouncilMemberCount(input.familyId);
      return createFamilyInvitation({ ...input, requestedByMemberId: membership.id, requiredApprovals: approvalRequirement(eligibleCouncil) });
    }),
    acceptInvitation: protectedProcedure.input(z.object({ invitationToken: z.string().length(64) })).mutation(async ({ ctx, input }) => {
      return acceptFamilyInvitation({ invitationToken: input.invitationToken, userId: ctx.user.id, displayName: ctx.user.name ?? "Family member", email: ctx.user.email ?? undefined });
    }),
    reviewInvitation: protectedProcedure.input(z.object({ invitationId: z.number().int().positive(), familyId: z.number().int().positive(), decision: z.enum(["approve", "reject"]) }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getMembership(input.familyId, ctx.user.id);
        if (!membership || !["admin", "council"].includes(membership.role)) throw new Error("Only the family council can review this invitation");
        return decideInvitation({ invitationId: input.invitationId, memberId: membership.id, decision: input.decision });
      }),
    storeAttachment: protectedProcedure.input(z.object({
      familyId: z.number().int().positive(), fileName: z.string().trim().min(1).max(255), mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), base64: z.string().min(1).max(9_000_000), targetType: z.enum(["profile", "relationship", "message", "family"]), targetId: z.number().int().positive(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await getMembership(input.familyId, ctx.user.id);
      if (!membership) throw new Error("You do not have access to this family");
      return storeFamilyAttachment({ ...input, uploadedByMemberId: membership.id });
    }),
  }),
  governance: router({
    create: protectedProcedure.input(z.object({
      familyId: z.number().int().positive(), title: z.string().trim().min(3).max(180), summary: z.string().trim().min(3).max(5000), category: z.enum(["membership", "home", "event", "policy", "other"]), closesAt: z.coerce.date().optional(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await getMembership(input.familyId, ctx.user.id);
      if (!membership || !["admin", "council"].includes(membership.role)) throw new Error("Only the family council can open a decision");
      return createGovernanceProposal({ ...input, createdByMemberId: membership.id, requiredApprovals: approvalRequirement(2) });
    }),
    vote: protectedProcedure.input(z.object({ proposalId: z.number().int().positive(), familyId: z.number().int().positive(), decision: z.enum(["approve", "acknowledge", "reject"]), note: z.string().trim().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getMembership(input.familyId, ctx.user.id);
        if (!membership || !["admin", "council"].includes(membership.role)) throw new Error("Only the family council can respond to this decision");
        return voteOnProposal({ proposalId: input.proposalId, memberId: membership.id, decision: input.decision, note: input.note });
      }),
  }),
});

export type AppRouter = typeof appRouter;
