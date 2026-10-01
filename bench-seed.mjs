/**
 * Builds a throwaway 50k-transaction database so the aggregate work can be
 * measured at the scale it was meant for. The real ledger has 1,115 rows, where
 * every approach looks fast.
 *
 * Run with DATABASE_URL pointed at data/bench.db. Never touches data/finanbolsa.db.
 */
import fs from "node:fs";
import Database from "better-sqlite3";

const TARGET = process.env.DATABASE_URL ?? "./data/bench.db";
const ROWS = Number(process.env.BENCH_ROWS ?? 50_000);

fs.rmSync(TARGET, { force: true });
fs.rmSync(TARGET + "-wal", { force: true });
fs.rmSync(TARGET + "-shm", { force: true });

// Start from the real ledger's schema and reference data, so account/category
// ids and the reference dates are the same shape production has.
const source = new Database("./data/finanbolsa.db", { readonly: true });
const db = new Database(TARGET);
db.pragma("journal_mode = WAL");

// Table list taken from the source rather than hardcoded, so a new migration
// does not silently produce a half-built benchmark database.
const TABLES = source
  .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name != '__drizzle_migrations'")
  .all()
  .map((r) => r.name);

for (const table of TABLES) {
  const sql = source
    .prepare("select sql from sqlite_master where type='table' and name = ?")
    .get(table);
  if (sql) db.exec(sql.sql);
}
for (const row of source
  .prepare("select name, sql from sqlite_master where type='index' and sql is not null")
  .all()) {
  db.exec(row.sql);
}
for (const table of TABLES.filter((t) => t !== "transactions" && t !== "transaction_splits")) {
  const columns = source.prepare(`pragma table_info(${table})`).all().map((c) => c.name);
  if (columns.length === 0) continue;
  const rows = source.prepare(`select * from ${table}`).all();
  if (rows.length === 0) continue;
  const placeholders = columns.map(() => "?").join(", ");
  const insert = db.prepare(
    `insert into ${table} (${columns.join(", ")}) values (${placeholders})`
  );
  for (const row of rows) insert.run(...columns.map((c) => row[c]));
}
source.close();

const accounts = db.prepare("select id, currency, reference_date, reference_balance_minor from accounts").all();
const categories = db.prepare("select id from categories").all();
const payees = db.prepare("select id from payees").all();

const CURRENCIES = ["COP", "COP", "COP", "COP", "COP", "USD", "EUR"];
const DESCRIPTIONS = [
  "NETO SERVICIOS", "EXITO", "DROGUERIA LA NUEVA", "CAFETERIA", "UBER TRIP",
  "PAGO TARJETA", "SUSCRIPCION NETFLIX", "SPOTIFY", "ARRIENDO", "SERVICIO",
];

// Two years of history, so the 12-month trend has a full window.
const START = Date.UTC(2024, 8, 1);
const END = Date.UTC(2026, 8, 16);
const SPAN = END - START;

// better-sqlite3's raw prepare() has no idea the `date` column is a drizzle
// timestamp, so a JS Date (or milliseconds) is written straight into an INTEGER
// that drizzle reads back as SECONDS. Writing milliseconds here puts every row
// in the year 56000-something, strftime returns NULL for all of them, and every
// month-bucketed aggregate quietly returns nothing â€” which would make the
// optimized pages look fast for the wrong reason.
const at = () => Math.floor((START + Math.floor(rand() * SPAN)) / 1000);

const insert = db.prepare(
  `insert into transactions
     (date, type, account_id, destination_account_id, amount_minor, currency,
      destination_amount_minor, destination_currency, category_id, payee_id,
      description, created_at, updated_at)
   values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`
);

// Deterministic PRNG so repeated runs measure the same database.
let seed = 20260927;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (list) => list[Math.floor(rand() * list.length)];

db.transaction(() => {
  for (let i = 0; i < ROWS; i++) {
    const account = pick(accounts);
    const roll = rand();
    const type = roll < 0.72 ? "expense" : roll < 0.93 ? "income" : "transfer";
    const currency = type === "transfer" ? account.currency : pick(CURRENCIES);
    const amount = Math.round((5000 + rand() * 900000) * 100) / 100;

    // 5% uncategorised, matching the real ledger's shape.
    const category = rand() < 0.05 ? null : pick(categories).id;
    const payee = rand() < 0.4 ? pick(payees).id : null;

    if (type === "transfer") {
      const destination = pick(accounts.filter((a) => a.id !== account.id));
      insert.run(
        at(),
        "transfer",
        account.id,
        destination.id,
        amount,
        account.currency,
        Math.round(amount * 0.00025 * 100) / 100,
        destination.currency,
        null,
        payee,
        "TRASLADO ENTRE CUENTAS"
      );
    } else {
      insert.run(
        at(),
        type,
        account.id,
        null,
        amount,
        currency,
        null,
        null,
        category,
        payee,
        type === "income" ? "ABONO NOMINA" : pick(DESCRIPTIONS)
      );
    }
  }
})();

db.exec("ANALYZE");
const total = db.prepare("select count(*) c from transactions").get().c;
db.close();

console.log(`${TARGET}: ${total} movimientos, ${accounts.length} cuentas, ${categories.length} categorias`);
