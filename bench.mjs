/**
 * Page size and latency, measured against a running production server.
 *
 * `npm run dev` would flatter the numbers and lie about them: it renders
 * differently and never pays the production render cost. Start the server
 * first, then:
 *
 *   npm run bench:seed                  # build data/bench.db with 50k rows
 *   DATABASE_URL=./data/bench.db npm run build && npm start
 *   DATABASE_URL=./data/bench.db npm run bench
 *
 * BENCH_ROWS overrides the row count. The real ledger has ~1,100 transactions,
 * where every approach looks fast and nothing can be compared.
 *
 * Each page is requested twice and the second answer is kept, so a cold route
 * compile does not land in the numbers.
 */
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";

const SECRET = "a".repeat(64);
const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 2592e6 })).toString("base64url");
const COOKIE =
  "finanbolsa_session=" + payload + "." + createHmac("sha256", SECRET).update(payload).digest("base64url");

const PAGES = ["/", "/cuentas", "/recurrentes", "/presupuesto?month=2026-08", "/transacciones"];

const probe = (path) => {
  const body = execFileSync(
    "curl.exe",
    ["-H", "Cookie: " + COOKIE, "-s", "-o", "NUL", "-w", "%{size_download} %{time_total}", "http://localhost:3000" + path],
    { encoding: "utf8" }
  );
  const [size, seconds] = body.trim().split(/\s+/);
  return { bytes: Number(size), ms: Math.round(Number(seconds) * 1000) };
};

// Warm the route cache first so the numbers are not a cold compile.
for (const path of PAGES) probe(path);

const dbFile = process.env.DATABASE_URL ?? "./data/finanbolsa.db";
const rows = execFileSync(
  "node",
  ["-e", `const D=require('better-sqlite3');const db=new D(process.argv[1],{readonly:true});console.log(db.prepare('select count(*) c from transactions where deleted_at is null').get().c);db.close();`, dbFile],
  { encoding: "utf8", env: { ...process.env, NODE_PATH: process.cwd() + "\\node_modules" } }
).trim();

console.log(`movimientos: ${rows}\n`);
console.log("pagina                          KB     ms");
console.log("-".repeat(46));
const results = [];
for (const path of PAGES) {
  const { bytes, ms } = probe(path);
  results.push({ path, bytes, ms });
  console.log(`${path.padEnd(30)} ${String(Math.round(bytes / 1024)).padStart(5)}  ${String(ms).padStart(5)}`);
}
console.log(JSON.stringify(results));
