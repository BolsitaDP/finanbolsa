/**
 * Genera un `.env` listo para desplegar, con el secreto de sesión ya hecho.
 *
 * Existe para quitar el paso que más se le falla a la gente: inventar un secreto
 * válido a mano. El formato importa —`src/lib/auth.ts` espera 32 bytes en hex para
 * el HMAC— y un `openssl rand -base64` produce algo de otra longitud que no es un
 * error visible, solo una firma distinta cada vez que el contenedor arranca.
 *
 *   npm run env:init
 *   npm run env:init -- --password "mi contraseña"
 *
 * No sobreescribe un `.env` que ya existe sin `--force`: regenerar el secreto
 * cierra las sesiones de quien esté usando la app, y eso debería ser una decisión
 * consciente y no el efecto secundario de un comando de arranque.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const passwordIndex = args.indexOf("--password");
const passwordArg = passwordIndex >= 0 ? args[passwordIndex + 1] : null;

const TARGET = ".env";

if (existsSync(TARGET) && !force) {
  console.error(
    `${TARGET} ya existe. No se toca nada.\n` +
      `  Para regenerarlo (esto INVALIDA las sesiones activas): npm run env:init -- --force\n` +
      `  Para ver o editar la contraseña:  ${TARGET}`
  );
  process.exit(1);
}

const template = readFileSync(".env.example", "utf8");
// Sin `--password` se genera una legible pero aleatoria, mejor que una
// marcador de posición que alguien se deja puesta. Se imprime para poder copiarla.
const generated = `${randomBytes(3).toString("hex")}-${randomBytes(3).toString("hex")}`;
const password = passwordArg ?? generated;
const secret = randomBytes(32).toString("hex");

const filled = template
  .replace(/^AUTH_PASSWORD=.*$/m, `AUTH_PASSWORD=${password}`)
  .replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET=${secret}`);

// 600: el archivo contiene la contraseña de la app y la llave que firma las
// sesiones. En una Pi con una sola cuenta de usuario, cualquiera que lo lea puede
// entrar. `chmod` es la defensa más barata que existe.
writeFileSync(TARGET, filled);
chmodSync(TARGET, 0o600);

console.log(`${TARGET} creado.`);
console.log(`  AUTH_SECRET generado (${secret.length} caracteres hex).`);
console.log(`  AUTH_PASSWORD: ${password}${passwordArg ? "" : "  (generada; cámbiala si quieres)"}`);
const port = filled.match(/^PUERTO=(\d+)$/m)?.[1] ?? "4000";
console.log("\nSiguiente paso:  ./deploy.sh");
console.log(`  y luego abre    http://<ip-de-la-pi>:${port}`);
