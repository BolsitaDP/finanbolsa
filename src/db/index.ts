import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "./data/finanbolsa.db";

// better-sqlite3 creates the .db file itself but not its parent directory —
// on a fresh clone (data/ isn't tracked in git) or a fresh Docker build,
// that directory doesn't exist yet, so this fails without it.
mkdirSync(dirname(url), { recursive: true });

const sqlite = new Database(url);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
