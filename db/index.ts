import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { c3Sql?: ReturnType<typeof postgres> };

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return globalForDb.c3Sql ??= postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
}

export function getDb() {
  return drizzle(client(), { schema });
}
