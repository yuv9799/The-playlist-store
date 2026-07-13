import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const getPrismaClient = () => {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  
  let adapter;
  if (url.startsWith("postgres:") || url.startsWith("postgresql:")) {
    const pool = new pg.Pool({ connectionString: url });
    adapter = new PrismaPg(pool);
  } else {
    adapter = new PrismaBetterSqlite3({ url });
  }

  return new PrismaClient({ adapter });
};

export const prisma = globalForPrisma.prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
