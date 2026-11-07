import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalDb = globalThis as unknown as { nourPrisma?: PrismaClient; nourPgPool?: Pool };

export function db(): PrismaClient {
  if (!globalDb.nourPrisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");

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

