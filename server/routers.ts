import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createFamilyInvitation, createFamilyWithFounder, createGovernanceProposal, createOpaqueMessage, decideInvitation, getFamilyDashboard, getMembership, storeFamilyAttachment, voteOnProposal } from "./db";
import { approvalRequirement } from "./domain";
import { privateRelayBoundary } from "./relayBoundary";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  family: router({
    dashboard: protectedProcedure.query(async ({ ctx }) => getFamilyDashboard(ctx.user.id)),
    bootstrap: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).optional() }))
      .mutation(async ({ ctx, input }) => {
        const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${nanoid(6).toLowerCase()}`;
        return createFamilyWithFounder({ userId: ctx.user.id, name: input.name, slug, description: input.description, founderName: ctx.user.name ?? "Family member" });
      }),
    sendOpaqueMessage: protectedProcedure.input(z.object({
      familyId: z.number().int().positive(), roomId: z.number().int().positive(), clientMessageId: z.string().min(8).max(100), ciphertext: z.string().min(1), encryptionScheme: z.enum(["nip44", "opaque"]),
    })).mutation(async ({ ctx, input }) => {
      const membership = await getMembership(input.familyId, ctx.user.id);
      if (!membership) throw new Error("You do not have access to this family");
      const relayResult = await privateRelayBoundary.publish({ ...input, senderMemberId: membership.id, createdAt: new Date() });
      const message = await createOpaqueMessage({ ...input, authorMemberId: membership.id });
      return { message, relayStatus: relayResult.status };
    }),
    invite: protectedProcedure.input(z.object({
      familyId: z.number().int().positive(), inviteeName: z.string().trim().min(2).max(120), inviteeEmail: z.string().trim().email(), membershipType: z.enum(["nuclear", "extended", "external"]), requestedRole: z.string().trim().max(100).optional(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await getMembership(input.familyId, ctx.user.id);
      if (!membership || !["admin", "council"].includes(membership.role)) throw new Error("Only the family council can create an invitation");
      const eligibleCouncil = 2;
      return createFamilyInvitation({ ...input, requestedByMemberId: membership.id, requiredApprovals: approvalRequirement(eligibleCouncil) });
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
