import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { parse } from "pg-connection-string";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
};

const getPrismaClient = () => {
  const isPostgres = process.env.DATABASE_URL?.startsWith("postgres:") || process.env.DATABASE_URL?.startsWith("postgresql:") || !!process.env.VERCEL;
  const url = process.env.DATABASE_URL || (isPostgres ? "postgresql://localhost:5432/dummy" : "file:./dev.db");
  let adapter;
  if (isPostgres) {
    const poolConfig = parse(url);
    poolConfig.ssl = url.includes("localhost") ? false : { rejectUnauthorized: false };
    const pool = new pg.Pool(poolConfig as any);
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
