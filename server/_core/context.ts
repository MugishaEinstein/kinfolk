import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getPasskeySessionUser } from "../passkeyAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  user = (await getPasskeySessionUser(opts.req)) ?? null;

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
