CREATE TABLE `chatRoomMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`memberId` int NOT NULL,
	`lastReadAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatRoomMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `chatRoomMembers_room_member_unique` UNIQUE(`roomId`,`memberId`)
);
--> statement-breakpoint
CREATE TABLE `chatRooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`kind` enum('general','nuclear','announcements','custom','direct') NOT NULL DEFAULT 'custom',
	`accessLevel` enum('family','nuclear','invited') NOT NULL DEFAULT 'family',
	`createdByMemberId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chatRooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `families` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(160) NOT NULL,
	`description` text,
	`country` varchar(80),
	`location` varchar(160),
	`photoUrl` text,
	`privacy` enum('private','invite_only') NOT NULL DEFAULT 'private',
	`approvalPolicy` enum('one','two','three','majority','all') NOT NULL DEFAULT 'two',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `families_id` PRIMARY KEY(`id`),
	CONSTRAINT `families_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `familyActivity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`actorMemberId` int,
	`type` varchar(80) NOT NULL,
	`message` varchar(500) NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `familyActivity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `familyMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`userId` int,
	`displayName` varchar(120) NOT NULL,
	`email` varchar(320),
	`photoUrl` text,
	`shortBio` text,
	`birthDate` timestamp,
	`membershipType` enum('nuclear','extended','external') NOT NULL DEFAULT 'extended',
	`relationshipLabel` varchar(100),
	`role` enum('member','council','admin') NOT NULL DEFAULT 'member',
	`status` enum('active','pending','revoked') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `familyMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `familyMembers_family_user_unique` UNIQUE(`familyId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `familyRelationships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`fromMemberId` int NOT NULL,
	`toMemberId` int NOT NULL,
	`relationshipType` enum('parent','child','partner','sibling','guardian','other') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `familyRelationships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `governanceProposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`createdByMemberId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`summary` text NOT NULL,
	`category` enum('membership','home','event','policy','other') NOT NULL DEFAULT 'other',
	`status` enum('open','approved','rejected','closed') NOT NULL DEFAULT 'open',
	`requiredApprovals` int NOT NULL DEFAULT 2,
	`closesAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `governanceProposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `governanceVotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int NOT NULL,
	`memberId` int NOT NULL,
	`decision` enum('approve','acknowledge','reject') NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `governanceVotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `governanceVotes_proposal_member_unique` UNIQUE(`proposalId`,`memberId`)
);
--> statement-breakpoint
CREATE TABLE `invitationApprovals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invitationId` int NOT NULL,
	`memberId` int NOT NULL,
	`decision` enum('approve','reject') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invitationApprovals_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitationApprovals_invitation_member_unique` UNIQUE(`invitationId`,`memberId`)
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`requestedByMemberId` int NOT NULL,
	`inviteeName` varchar(120) NOT NULL,
	`inviteeEmail` varchar(320) NOT NULL,
	`membershipType` enum('nuclear','extended','external') NOT NULL DEFAULT 'extended',
	`requestedRole` varchar(100),
	`tokenDigest` varchar(128) NOT NULL,
	`status` enum('sent','accepted','pending_approval','approved','rejected','expired') NOT NULL DEFAULT 'sent',
	`requiredApprovals` int NOT NULL DEFAULT 2,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mediaAssets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`uploadedByMemberId` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` text NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(160) NOT NULL,
	`targetType` enum('profile','relationship','message','family') NOT NULL,
	`targetId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mediaAssets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memberNotifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`memberId` int NOT NULL,
	`type` enum('invitation','mention','governance','system') NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text,
	`targetPath` varchar(255),
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memberNotifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`roomId` int NOT NULL,
	`authorMemberId` int NOT NULL,
	`clientMessageId` varchar(100) NOT NULL,
	`ciphertext` text NOT NULL,
	`encryptionScheme` enum('nip44','opaque') NOT NULL DEFAULT 'opaque',
	`relayStatus` enum('queued','published','failed') NOT NULL DEFAULT 'queued',
	`relayEventId` varchar(128),
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`editedAt` timestamp,
	`deletedAt` timestamp,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `messages_client_id_unique` UNIQUE(`clientMessageId`)
);
--> statement-breakpoint
CREATE TABLE `relayEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`messageId` int,
	`nostrEventId` varchar(128),
	`relayUrl` varchar(512),
	`eventKind` int NOT NULL,
	`encryptedPayload` text NOT NULL,
	`status` enum('queued','published','failed') NOT NULL DEFAULT 'queued',
	`retryCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `relayEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `chatRooms_family_idx` ON `chatRooms` (`familyId`);--> statement-breakpoint
CREATE INDEX `familyActivity_family_created_idx` ON `familyActivity` (`familyId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `familyMembers_family_idx` ON `familyMembers` (`familyId`);--> statement-breakpoint
CREATE INDEX `familyMembers_user_idx` ON `familyMembers` (`userId`);--> statement-breakpoint
CREATE INDEX `familyRelationships_family_idx` ON `familyRelationships` (`familyId`);--> statement-breakpoint
CREATE INDEX `governanceProposals_family_status_idx` ON `governanceProposals` (`familyId`,`status`);--> statement-breakpoint
CREATE INDEX `invitations_family_status_idx` ON `invitations` (`familyId`,`status`);--> statement-breakpoint
CREATE INDEX `mediaAssets_target_idx` ON `mediaAssets` (`familyId`,`targetType`,`targetId`);--> statement-breakpoint
CREATE INDEX `memberNotifications_member_read_idx` ON `memberNotifications` (`memberId`,`readAt`);--> statement-breakpoint
CREATE INDEX `messages_room_sent_idx` ON `messages` (`roomId`,`sentAt`);--> statement-breakpoint
CREATE INDEX `relayEvents_family_status_idx` ON `relayEvents` (`familyId`,`status`);