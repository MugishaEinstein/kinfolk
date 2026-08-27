import { index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** Public passkey material only; fingerprint and private key data remain on the user's device. */
export const webauthnCredentials = mysqlTable("webauthnCredentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  credentialId: varchar("credentialId", { length: 1024 }).notNull(),
  publicKey: text("publicKey").notNull(),
  counter: int("counter").default(0).notNull(),
  transports: json("transports"),
  deviceType: varchar("deviceType", { length: 40 }).notNull(),
  backedUp: int("backedUp").default(0).notNull(),
  aaguid: varchar("aaguid", { length: 64 }),
  friendlyName: varchar("friendlyName", { length: 120 }),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("webauthnCredentials_credential_unique").on(table.credentialId),
  index("webauthnCredentials_user_idx").on(table.userId),
]);

/** One-time WebAuthn ceremony state; challenges expire and are marked consumed after verification. */
export const webauthnChallenges = mysqlTable("webauthnChallenges", {
  id: varchar("id", { length: 80 }).primaryKey(),
  ceremony: mysqlEnum("ceremony", ["registration", "authentication"]).notNull(),
  challenge: varchar("challenge", { length: 512 }).notNull(),
  userId: int("userId"),
  displayName: varchar("displayName", { length: 120 }),
  email: varchar("email", { length: 320 }),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("webauthnChallenges_expires_idx").on(table.expiresAt)]);

export const families = mysqlTable("families", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 160 }).notNull(),
  description: text("description"),
  country: varchar("country", { length: 80 }),
  location: varchar("location", { length: 160 }),
  photoUrl: text("photoUrl"),
  privacy: mysqlEnum("privacy", ["private", "invite_only"]).default("private").notNull(),
  approvalPolicy: mysqlEnum("approvalPolicy", ["one", "two", "three", "majority", "all"]).default("two").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("families_slug_unique").on(table.slug)]);

export const familyMembers = mysqlTable("familyMembers", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  userId: int("userId"),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }),
  photoUrl: text("photoUrl"),
  shortBio: text("shortBio"),
  nostrPubkey: varchar("nostrPubkey", { length: 64 }),
  birthDate: timestamp("birthDate"),
  membershipType: mysqlEnum("membershipType", ["nuclear", "extended", "external"]).default("extended").notNull(),
  relationshipLabel: varchar("relationshipLabel", { length: 100 }),
  role: mysqlEnum("role", ["member", "council", "admin"]).default("member").notNull(),
  status: mysqlEnum("status", ["active", "pending", "revoked"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("familyMembers_family_idx").on(table.familyId),
  index("familyMembers_user_idx").on(table.userId),
  uniqueIndex("familyMembers_family_user_unique").on(table.familyId, table.userId),
]);

export const familyRelationships = mysqlTable("familyRelationships", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  fromMemberId: int("fromMemberId").notNull(),
  toMemberId: int("toMemberId").notNull(),
  relationshipType: mysqlEnum("relationshipType", ["parent", "child", "partner", "sibling", "guardian", "other"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("familyRelationships_family_idx").on(table.familyId)]);

export const chatRooms = mysqlTable("chatRooms", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  kind: mysqlEnum("kind", ["general", "nuclear", "announcements", "custom", "direct"]).default("custom").notNull(),
  accessLevel: mysqlEnum("accessLevel", ["family", "nuclear", "invited"]).default("family").notNull(),
  createdByMemberId: int("createdByMemberId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("chatRooms_family_idx").on(table.familyId)]);

export const chatRoomMembers = mysqlTable("chatRoomMembers", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  memberId: int("memberId").notNull(),
  lastReadAt: timestamp("lastReadAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("chatRoomMembers_room_member_unique").on(table.roomId, table.memberId)]);

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  roomId: int("roomId").notNull(),
  authorMemberId: int("authorMemberId").notNull(),
  clientMessageId: varchar("clientMessageId", { length: 100 }).notNull(),
  ciphertext: text("ciphertext").notNull(),
  encryptionScheme: mysqlEnum("encryptionScheme", ["nip44", "opaque"]).default("opaque").notNull(),
  relayStatus: mysqlEnum("relayStatus", ["queued", "published", "failed"]).default("queued").notNull(),
  relayEventId: varchar("relayEventId", { length: 128 }),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  editedAt: timestamp("editedAt"),
  deletedAt: timestamp("deletedAt"),
}, (table) => [
  index("messages_room_sent_idx").on(table.roomId, table.sentAt),
  uniqueIndex("messages_client_id_unique").on(table.clientMessageId),
]);

export const invitations = mysqlTable("invitations", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  requestedByMemberId: int("requestedByMemberId").notNull(),
  acceptedUserId: int("acceptedUserId"),
  inviteeName: varchar("inviteeName", { length: 120 }).notNull(),
  inviteeEmail: varchar("inviteeEmail", { length: 320 }).notNull(),
  membershipType: mysqlEnum("membershipType", ["nuclear", "extended", "external"]).default("extended").notNull(),
  requestedRole: varchar("requestedRole", { length: 100 }),
  tokenDigest: varchar("tokenDigest", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["sent", "accepted", "pending_approval", "approved", "rejected", "expired"]).default("sent").notNull(),
  requiredApprovals: int("requiredApprovals").default(2).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("invitations_family_status_idx").on(table.familyId, table.status)]);

export const invitationApprovals = mysqlTable("invitationApprovals", {
  id: int("id").autoincrement().primaryKey(),
  invitationId: int("invitationId").notNull(),
  memberId: int("memberId").notNull(),
  decision: mysqlEnum("decision", ["approve", "reject"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("invitationApprovals_invitation_member_unique").on(table.invitationId, table.memberId)]);

export const governanceProposals = mysqlTable("governanceProposals", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  createdByMemberId: int("createdByMemberId").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  summary: text("summary").notNull(),
  category: mysqlEnum("category", ["membership", "home", "event", "policy", "other"]).default("other").notNull(),
  status: mysqlEnum("status", ["open", "approved", "rejected", "closed"]).default("open").notNull(),
  requiredApprovals: int("requiredApprovals").default(2).notNull(),
  closesAt: timestamp("closesAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("governanceProposals_family_status_idx").on(table.familyId, table.status)]);

export const governanceVotes = mysqlTable("governanceVotes", {
  id: int("id").autoincrement().primaryKey(),
  proposalId: int("proposalId").notNull(),
  memberId: int("memberId").notNull(),
  decision: mysqlEnum("decision", ["approve", "acknowledge", "reject"]).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("governanceVotes_proposal_member_unique").on(table.proposalId, table.memberId)]);

export const mediaAssets = mysqlTable("mediaAssets", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  uploadedByMemberId: int("uploadedByMemberId").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: text("storageUrl").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 160 }).notNull(),
  targetType: mysqlEnum("targetType", ["profile", "relationship", "message", "family"]).notNull(),
  targetId: int("targetId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("mediaAssets_target_idx").on(table.familyId, table.targetType, table.targetId)]);

export const memberNotifications = mysqlTable("memberNotifications", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  memberId: int("memberId").notNull(),
  type: mysqlEnum("type", ["invitation", "mention", "governance", "system"]).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body"),
  targetPath: varchar("targetPath", { length: 255 }),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("memberNotifications_member_read_idx").on(table.memberId, table.readAt)]);

export const relayEvents = mysqlTable("relayEvents", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  messageId: int("messageId"),
  nostrEventId: varchar("nostrEventId", { length: 128 }),
  relayUrl: varchar("relayUrl", { length: 512 }),
  eventKind: int("eventKind").notNull(),
  encryptedPayload: text("encryptedPayload").notNull(),
  status: mysqlEnum("status", ["queued", "published", "failed"]).default("queued").notNull(),
  retryCount: int("retryCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("relayEvents_family_status_idx").on(table.familyId, table.status)]);

export const familyActivity = mysqlTable("familyActivity", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  actorMemberId: int("actorMemberId"),
  type: varchar("type", { length: 80 }).notNull(),
  message: varchar("message", { length: 500 }).notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("familyActivity_family_created_idx").on(table.familyId, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
