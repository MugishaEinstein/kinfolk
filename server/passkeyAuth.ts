import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import type { Request } from "express";
import * as db from "./db";

const textEncoder = new TextEncoder();

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters for passkey sessions");
  return textEncoder.encode(secret);
}

export async function createPasskeySession(userId: number) {
  return new SignJWT({ userId, mechanism: "passkey" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function getPasskeySessionUser(req: Request) {
  const cookie = parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME];
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, secretKey(), { algorithms: ["HS256"] });
    if (payload.mechanism !== "passkey" || typeof payload.userId !== "number") return null;
    return await db.getUserById(payload.userId);
  } catch {
    return null;
  }
}
