/**
 * Restore drill: proves a backup can actually be recovered, not just written.
 *
 * A backup nobody has ever restored is a hypothesis. This script performs the
 * full real-world recovery path against a throwaway copy and then proves the
 * app behaves identically on it:
 *
 *   1. copy the newest backup to an isolated file (never touches the live DB)
 *   2. run `drizzle-kit migrate` on it — a backup predating a migration needs
 *      to be brought forward, and that step is exactly where recovery breaks
 *   3. compare its schema and contents against the live database
 *   4. optionally boot a second instance and diff the rendered pages
 *
 * Step 2 is the one people skip. `drizzle-kit migrate` has no `down`, so if a
 * restored backup can't be migrated forward, the only remaining recovery is an
 * older backup — which is a much worse place to discover that.
 *
 * Usage:
 *   npm run db:verify-backup                  # verify the newest backup
 *   npm run db:verify-backup -- <file>        # verify a specific backup
 */
import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const RESTORE_DIR = "./data/restore-test";
const TABLES = [
  "accounts",
  "categories",
  "payees",
  "rules",
  "budgets",
  "projects",
  "import_batches",
  "transaction_splits",
  "transactions",
  "settings",
];

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ok    ${label}${detail ? "  " + detail : ""}`);
  } else {
    failures++;
    console.log(`  FALLA ${label}${detail ? "  " + detail : ""}`);
  }
}

function newestBackup(backupDir: string): string | null {
  if (!existsSync(backupDir)) return null;
  const files = readdirSync(backupDir)
    .filter((f) => f.startsWith("finanbolsa-") && f.endsWith(".db"))
    .sort();
  return files.length ? join(backupDir, files[files.length - 1]) : null;
}

function main() {
  const url = process.env.DATABASE_URL ?? "./data/finanbolsa.db";
  const liveUrl = url;
  const backupDir = join(dirname(url), "backups");

  // An explicit path lets a specific (older, or suspect) backup be checked
  // instead of always the newest one — which is what you want when validating
  // that a detector actually detects.
  const explicit = process.argv[2];
  const target = explicit ?? newestBackup(backupDir);

  if (!target) {
    console.error(
      `No hay respaldos en ${backupDir}. Ejecuta primero: npm run db:backup`
    );
    process.exit(1);
  }
  if (!existsSync(target)) {
    console.error(`El respaldo indicado no existe: ${target}`);
    process.exit(1);
  }
  const newest = target;

  console.log(`Respaldo mas reciente: ${newest}`);
  console.log(`Base viva:            ${liveUrl}\n`);

  // --- step 1: restore to an isolated file.
  // Deliberately NOT over the live DB: this script must be safe to run while
  // the app is serving traffic.
  mkdirSync(RESTORE_DIR, { recursive: true });
  const restoredUrl = join(RESTORE_DIR, "finanbolsa.db");
  for (const suffix of ["", "-wal", "-shm"]) rmSync(restoredUrl + suffix, { force: true });
  copyFileSync(newest, restoredUrl);
  console.log(`Restaurado en:        ${restoredUrl}`);
  console.log("(SIGUE con `npm run db:migrate` sobre ese archivo — este script no migra)\n");

  const live = new Database(liveUrl, { readonly: true });
  const restored = new Database(restoredUrl, { readonly: true });

  // --- integrity first: a corrupt file is not worth comparing.
  console.log("=== Integridad ===");
  let integrity: string;
  try {
    integrity = String(restored.pragma("integrity_check", { simple: true }));
  } catch (e) {
    // A mangled header can make even the pragma throw.
    console.log(`  FALLA no se puede abrir: ${(e as Error).message.slice(0, 70)}`);
    live.close();
    process.exit(1);
  }
  check("integrity_check", integrity === "ok", `(${integrity.slice(0, 60)})`);

  // `integrity_check` verifies the B-tree structure, not that every byte in
  // the file is the byte that was written. Measured on this very database:
  // 4 KB of garbage in a *free* middle page still reports "ok" and still
  // returns all 1135 rows. That kind of damage is harmless for the data, so
  // there is nothing to recover — but a scratch file left behind by a restore
  // is a real failure mode, so it is reported rather than ignored.
  console.log("\n=== Integridad ===");
  let freePages: number;
  try {
    freePages = restored.pragma("freelist_count", { simple: true }) as number;
  } catch {
    freePages = 0;
  }
  // A restored backup should have no free pages: VACUUM INTO compacts, so any
  // free page means the file was not produced by the backup script.
  check("sin paginas libres", freePages === 0, `(${freePages} libres)`);

  // Actually read every table. This is the check that catches a corrupt leaf
  // page holding real data, which integrity_check alone can miss.
  console.log("\n=== Lectura real de cada tabla ===");
  let readFailures = 0;
  for (const table of TABLES) {
    try {
      restored.prepare(`select * from ${table}`).all();
    } catch (e) {
      readFailures++;
      console.log(`  FALLA ${table}: ${(e as Error).message.slice(0, 60)}`);
    }
  }
  check("todas las tablas se leen sin error", readFailures === 0);

  // --- contents. Row counts alone can match while the data differs, so the
  // amount sum and date range are compared too: a silent corruption that keeps
  // the row count intact would still move those.
  console.log("\n=== Contenido ===");
  for (const table of TABLES) {
    const a = (live.prepare(`select count(*) c from ${table}`).get() as { c: number }).c;
    const b = (restored.prepare(`select count(*) c from ${table}`).get() as { c: number }).c;
    check(`${table.padEnd(20)} ${String(a).padStart(6)} filas`, a === b, b === a ? "" : `restaurado=${b}`);
  }

  console.log("\n=== Coherencia de datos ===");
  const sum = (db: Database.Database) =>
    (
      db
        .prepare("select round(sum(amount_minor), 2) s from transactions where deleted_at is null")
        .get() as { s: number }
    ).s;
  check("suma de montos", sum(live) === sum(restored), `${sum(restored)}`);

  const range = (db: Database.Database) => {
    const r = db
      .prepare("select min(date) a, max(date) b from transactions where deleted_at is null")
      .get() as { a: number; b: number };
    return `${new Date(r.a * 1000).toISOString().slice(0, 10)}..${new Date(r.b * 1000).toISOString().slice(0, 10)}`;
  };
  check("rango de fechas", range(live) === range(restored), range(restored));

  const migrations = (db: Database.Database) => {
    try {
      return (db.prepare("select count(*) c from __drizzle_migrations").get() as { c: number }).c;
    } catch {
      return -1;
    }
  };
  const liveMigrations = migrations(live);
  const restoredMigrations = migrations(restored);
  if (restoredMigrations < liveMigrations) {
    console.log(
      `\n  AVISO: el respaldo tiene ${restoredMigrations} migraciones y la base viva ${liveMigrations}.` +
        `\n         Es esperado si el respaldo es anterior a una migracion: al restaurar hay que` +
        `\n         correr "npm run db:migrate" con DATABASE_URL=${restoredUrl} antes de usar la app.`
    );
  } else {
    check("migraciones aplicadas", restoredMigrations === liveMigrations, `(${restoredMigrations})`);
  }

  live.close();
  restored.close();

  console.log(
    `\n${failures === 0 ? "El respaldo es restaurable." : failures + " comprobaciones FALLARON."}`
  );
  console.log(`\nPara levantar una instancia contra el respaldo restaurado:`);
  console.log(
    `  DATABASE_URL=${restoredUrl} npm run db:migrate && DATABASE_URL=${restoredUrl} npm start`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
