CREATE TABLE `webauthnChallenges` (
	`id` varchar(80) NOT NULL,
	`ceremony` enum('registration','authentication') NOT NULL,
	`challenge` varchar(512) NOT NULL,
	`userId` int,
	`displayName` varchar(120),
	`email` varchar(320),
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webauthnChallenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webauthnCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`credentialId` varchar(1024) NOT NULL,
	`publicKey` text NOT NULL,
	`counter` int NOT NULL DEFAULT 0,
	`transports` json,
	`deviceType` varchar(40) NOT NULL,
	`backedUp` int NOT NULL DEFAULT 0,
	`aaguid` varchar(64),
	`friendlyName` varchar(120),
	`lastUsedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webauthnCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `webauthnCredentials_credential_unique` UNIQUE(`credentialId`)
);
--> statement-breakpoint
ALTER TABLE `familyMembers` ADD `nostrPubkey` varchar(64);--> statement-breakpoint
CREATE INDEX `webauthnChallenges_expires_idx` ON `webauthnChallenges` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `webauthnCredentials_user_idx` ON `webauthnCredentials` (`userId`);