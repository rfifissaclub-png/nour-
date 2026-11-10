import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalDb = globalThis as unknown as { nourPrisma?: PrismaClient; nourPgPool?: Pool };

function normalizeConnectionString(value: string): string {
  try {
    const url = new URL(value);
    // pg's connection-string parser can let sslmode=require/verify-full
    // override the Pool ssl object. Vercel's Supabase integration may include
    // those parameters while its CA chain is not available in the function.
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    return url.toString();
  } catch {
    return value.replace(/([?&])sslmode=[^&]*&?/i, "$1").replace(/[?&]uselibpqcompat=[^&]*&?/i, "?");
  }
}

export function db(): PrismaClient {
  if (!globalDb.nourPrisma) {
    // Prefer the Supabase/Vercel integration URL when both the legacy Vercel
    // DATABASE_URL and the Nour Supabase connection are present.
    const rawConnectionString = process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL;
    const connectionString = rawConnectionString ? normalizeConnectionString(rawConnectionString) : undefined;
    if (!connectionString) throw new Error("POSTGRES_PRISMA_URL or DATABASE_URL is required");

    const pool = new Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 10000,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    });

    globalDb.nourPgPool = pool;
    globalDb.nourPrisma = new PrismaClient({
      adapter: new PrismaPg(pool),
    });
  }
  return globalDb.nourPrisma;
}
