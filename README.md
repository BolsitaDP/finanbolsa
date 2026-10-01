# FinanBolsa

Finanzas personales para una persona, autoalojada. Next.js 16 + SQLite.

Pensado para correr en un Raspberry Pi en la red de casa y usarse desde el
celular o el portátil. Una instancia, un usuario, una contraseña. No hay
multi-tenancy, ni cuentas de usuario, ni nada que lo justifique.

## Requisitos

- Node 22 (o el Dockerfile incluido, que ya lo trae)
- SQLite, vía `better-sqlite3` (compila un addon nativo)

## Puesta en marcha

```bash
npm install
cp .env.example .env.local     # y rellena AUTH_PASSWORD y AUTH_SECRET
npm run db:migrate
npm run dev
```

Abre <http://localhost:3000>. Te va a pedir la contraseña.

### Variables de entorno

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | no | Ruta del archivo SQLite. Por defecto `./data/finanbolsa.db` |
| `AUTH_PASSWORD` | **sí** | Contraseña de acceso. Sin ella la app sirve `/login` pero rechaza todo |
| `AUTH_SECRET` | **sí** | Firma la cookie de sesión. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Cambiarlo revoca las sesiones activas |
| `FINANBOLSA_HTTPS` | no | `true` **solo** si sirves por HTTPS |

> **`FINANBOLSA_HTTPS` déjalo en `false` si accedes por IP de LAN.** Con `true` la
> cookie se marca `Secure`, el navegador la descarta en http plano y el login es
> imposible. No es un aviso teórico: es la forma más rápida de dejar la app
> inaccesible.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `start` | Build y arranque de producción |
| `npm test` | Suite de tests (207) |
| `npm run lint` / `tsc --noEmit` | Lint y tipos |
| `npm run db:migrate` | Aplica las migraciones |
| `npm run db:generate` | Genera una migración desde el schema |
| `npm run db:studio` | Abre Drizzle Studio |
| `npm run db:seed` | Datos de ejemplo |
| `npm run db:backup` | Copia consistente con `VACUUM INTO` a `data/backups/` |
| `npm run db:verify-backup` | Restaura una copia aparte y la compara con la viva |
| `npm run bench:seed` | Construye `data/bench.db` con 50.000 movimientos |
| `npm run bench` | Tamaño y latencia por página, contra un servidor corriendo |

`db:seed` **no** es seguro sobre datos reales: borra y reemplaza. Sirve para
empezar de cero o para una demo.

## Docker (Raspberry Pi)

```bash
echo "AUTH_PASSWORD=..." >> .env
echo "AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> .env
echo "FINANBOLSA_HTTPS=false" >> .env

docker compose up -d --build
```

Dos servicios: `web` y `backup`. El contenedor corre las migraciones y luego
arranca. El volumen es `./data` en el host, así que la base sobrevive a
rebuilds.

> **La imagen es arm64 y se compila en el Pi.** `better-sqlite3` es un addon
> nativo; cross-compilar desde x86 no es soportado aquí. El `Dockerfile` lo dice
> también, pero conviene saberlo antes de perder media hora intentando.

### Acceder desde otro dispositivo

El compose publica el puerto 3000 en la LAN. Entra por la IP del Pi. Sin HTTPS,
a propósito: en una red de casa, un certificado autofirmado solo produce
advertencias y no protege de nada el tráfico que no sale de tu router.

Si algún día lo expones fuera de casa, eso deja de ser aceptable: ahí sí hacen
falta HTTPS y una contraseña bastante más fuerte.

## Datos y respaldo

La base es un archivo: `data/finanbolsa.db`.

- `npm run db:backup` escribe una copia consistente (no copiar el archivo en
  caliente, que puede salir truncado si hay una escritura en curso).
- `npm run db:verify-backup` **restaura** la copia en un directorio aparte y
  compara página por página con la base viva. Un backup que nunca se restauró es
  una hipótesis, no un respaldo.
- El servicio `backup` del compose corre lo mismo una vez al día, con retención
  de 14 días.

> **El riesgo que no está resuelto:** las copias quedan en la misma tarjeta SD
> que la base. Si la tarjeta se muere, se pierden ambas. Está documentado a
> propósito en `PLAN.md` y no se ha arreglado, porque arreglarlo significa (o un
> destino externo, o snapshots del FS) y esa decisión es tuya. Lo que sí es
> verificable es que la copia esté bien, y para eso está `db:verify-backup`.

## Cómo está hecho

Lo que conviene saber antes de tocar cosas:

- **Los totales se calculan en SQL**, no en JavaScript. `src/lib/aggregates.ts`
  tiene los `GROUP BY`; `balance.ts` y `spending-stats.ts` se conservan como
  implementación de referencia legible, y un test comprueba que ambos coinciden
  contra la base real. Ese test es la red de seguridad de todo el rendimiento.
- **Un solo bucketing de mes.** `monthKey()` (local) y `transactionMonth` (SQL,
  en `month-sql.ts`) son la única definición. Se llegó aquí por tres bugs
  distintos de zona horaria, uno de los cuales estaba corrompiendo el CSV
  exportado. Ver `ROADMAP.md` §3.1.
- **Las fechas se escriben siempre en hora local**, con `toDateInputValue` /
  `fromDateInputValue`. `toISOString()` en un dato de negocio es un bug esperando.
- **La conversión de moneda es opt-in y apagada por defecto.** Con la opción
  apagada, los montos en otras monedas se muestran aparte y no se suman, y no se
  pide ninguna tasa. Con la opción encendida hay un botón que trae la TRM
  oficial de datos.gov.co. Ver `ROADMAP.md` §3.2.
- **Autenticación**: una contraseña compartida, cookie HMAC, gate en
  `src/proxy.ts` (en Next 16 `middleware.ts` se llama `proxy.ts`). Las Server
  Actions destructivas y `/api/export` vuelven a validar, porque un gate de
  proxy no es una autorización.
- **Zona horaria**: los meses se agrupan en hora local en todas partes, nunca en
  UTC. Un movimiento del 31 a las 8 p. m. es del mes en el que ocurrió.

## Documentación

- `PLAN.md` — bitácora de trabajo: qué se hizo, por qué, y con qué mediciones.
- `ROADMAP.md` — dirección futura. Lo que está hecho y lo que no, con el
  esfuerzo estimado de cada cosa pendiente.
