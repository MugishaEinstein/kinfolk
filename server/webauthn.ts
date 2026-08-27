import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Response } from "express";
import { getSessionCookieOptions } from "./_core/cookies";
import * as db from "./db";
import { createPasskeySession } from "./passkeyAuth";
import type { TrpcContext } from "./_core/context";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

const rpId = process.env.VITE_WEBAUTHN_RP_ID ?? "chat.nostr.africa";
const origin = process.env.VITE_WEBAUTHN_ORIGIN ?? "https://chat.nostr.africa";
const textEncoder = new TextEncoder();

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function setSession(res: Response, req: TrpcContext["req"], userId: number) {
  return createPasskeySession(userId).then(token => {
    res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
  });
}

export async function startPasskeyRegistration(input: { displayName: string; email?: string }) {
  const displayName = cleanName(input.displayName);
  const email = input.email?.trim().toLowerCase() || undefined;
  const challengeId = crypto.randomUUID();
  const options = await generateRegistrationOptions({
    rpName: "Kinfolk Family Home",
    rpID: rpId,
    userName: email ?? `kinfolk-${challengeId.slice(0, 8)}`,
    userDisplayName: displayName,
    userID: textEncoder.encode(challengeId),
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "required", authenticatorAttachment: "platform" },
    preferredAuthenticatorType: "localDevice",
  });
  await db.createWebAuthnChallenge({ id: challengeId, ceremony: "registration", challenge: options.challenge, displayName, email });
  return { challengeId, options };
}

export async function finishPasskeyRegistration(input: { challengeId: string; response: RegistrationResponseJSON; ctx: TrpcContext }) {
  const ceremony = await db.consumeWebAuthnChallenge(input.challengeId, "registration");
  if (!ceremony?.displayName) throw new Error("This passkey registration has expired. Start again.");
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: ceremony.challenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo) throw new Error("Your device could not verify this passkey.");
  const user = await db.createPasskeyUser({ displayName: ceremony.displayName, email: ceremony.email ?? undefined });
  const credential = verification.registrationInfo.credential;
  await db.storeWebAuthnCredential({
    userId: user.id,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceType: verification.registrationInfo.credentialDeviceType,
    backedUp: verification.registrationInfo.credentialBackedUp,
    aaguid: verification.registrationInfo.aaguid,
  });
  await setSession(input.ctx.res, input.ctx.req, user.id);
  return { user };
}

export async function startPasskeyAuthentication() {
  const challengeId = crypto.randomUUID();
  const options = await generateAuthenticationOptions({ rpID: rpId, userVerification: "required" });
  await db.createWebAuthnChallenge({ id: challengeId, ceremony: "authentication", challenge: options.challenge });
  return { challengeId, options };
}

export async function finishPasskeyAuthentication(input: { challengeId: string; response: AuthenticationResponseJSON; ctx: TrpcContext }) {
  const ceremony = await db.consumeWebAuthnChallenge(input.challengeId, "authentication");
  if (!ceremony) throw new Error("This sign-in request has expired. Try again.");
  const storedCredential = await db.getWebAuthnCredentialById(input.response.id);
  if (!storedCredential) throw new Error("This passkey is not registered with Kinfolk.");
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: ceremony.challenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    requireUserVerification: true,
    credential: {
      id: storedCredential.credentialId,
      publicKey: Buffer.from(storedCredential.publicKey, "base64url"),
      counter: storedCredential.counter,
      transports: (storedCredential.transports as ("ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb")[] | null) ?? undefined,
    },
  });
  if (!verification.verified) throw new Error("Your device could not verify this passkey.");
  await db.updateWebAuthnCredentialUse(storedCredential.id, verification.authenticationInfo.newCounter);
  await setSession(input.ctx.res, input.ctx.req, storedCredential.userId);
  const user = await db.getUserById(storedCredential.userId);
  if (!user) throw new Error("The passkey account is unavailable.");
  return { user };
}
