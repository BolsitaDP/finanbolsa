/**
 * Daily database backup via SQLite's online `VACUUM INTO`.
 *
 * Why not just copy the file: the DB runs in WAL mode, so `finanbolsa.db` on
 * its own is incomplete — the most recent writes live in the `-wal` sidecar
 * until a checkpoint happens to fold them in. At the time this was written the
 * WAL was 4.1 MB against a 245 KB database, i.e. most of the recent history was
 * only in the sidecar. Copying the `.db` alone silently loses it, and copying
 * the files mid-write risks a torn, unopenable backup.
 *
 * `VACUUM INTO` writes a fresh, self-contained, already-compacted database from
 * a consistent read of the live one. No downtime, no locking of writers, and
 * the `-wal`/`-shm` files are irrelevant to the result. The target must not
 * already exist, hence the date-stamped name.
 *
 * Run with: npm run db:backup
 */
import Database from "better-sqlite3";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const RETENTION_DAYS = 14;
const PREFIX = "finanbolsa-";

function main() {
  const url = process.env.DATABASE_URL ?? "./data/finanbolsa.db";
  const backupDir = join(dirname(url), "backups");
  mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 10);
  const target = join(backupDir, `${PREFIX}${stamp}.db`);
  if (statSync(target, { throwIfNoEntry: false })) {
    // VACUUM INTO refuses to overwrite. A same-day re-run is a normal thing to
    // do (testing a restore, catching a mistake), so replace rather than fail —
    // today's backup should always be the most recent known-good one.
    rmSync(target, { force: true });
  }

  const db = new Database(url, { readonly: true });
  try {
    // `into` is bound as a parameter; SQLite does not accept an expression here.
    db.prepare("VACUUM main INTO ?").run(target);
  } finally {
    db.close();
  }

  const { size } = statSync(target);
  prune(backupDir);

  console.log(
    `Backup escrito: ${target} (${(size / 1024).toFixed(0)} KB) — retención ${RETENTION_DAYS} días`
  );
}

/** Deletes backups older than the retention window. Best-effort by design. */
function prune(dir: string) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(PREFIX) || !name.endsWith(".db")) continue;
    const path = join(dir, name);
    const mtime = statSync(path).mtimeMs;
    if (mtime < cutoff) {
      rmSync(path, { force: true });
      console.log(`Backup eliminado por retención: ${name}`);
    }
  }
}

try {
  main();
} catch (error) {
  // Non-zero exit so whatever schedules this (the compose `backup` service)
  // surfaces the failure instead of looking like a successful no-op day.
  console.error("Backup falló:", error);
  process.exit(1);
}
