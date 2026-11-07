import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { nourPrisma?: PrismaClient };
export function db(): PrismaClient {
  if (!globalDb.nourPrisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    globalDb.nourPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 5000 }),
    });
  }
  return globalDb.nourPrisma;
}
