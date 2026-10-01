# FinanBolsa

Finanzas personales para una persona, autoalojada. Next.js 16 + SQLite.

Pensado para correr en un Raspberry Pi en la red de casa y usarse desde el
celular o el portátil. Una instancia, un usuario, una contraseña. No hay
multi-tenancy, ni cuentas de usuario, ni nada que lo justifique.

## Requisitos

- Node 22 (o el Dockerfile incluido, que ya lo trae)
- SQLite, vía `better-sqlite3` (compila un addon nativo)

## Puesta en marcha (en tu máquina)

```bash
npm install
npm run env:init               # genera .env con un AUTH_SECRET aleatorio
npm run db:migrate
npm run dev
```

Abre <http://localhost:3000>. Te va a pedir la contraseña.

> **El archivo se llama `.env`, no `.env.local`.** Es el nombre que leen Next y
> Docker por igual. La versión anterior de este README decía `.env.local`; con ese
> nombre el `docker compose up` falla con `AUTH_PASSWORD no definido` sin más
> explicación, porque compose nunca leyó ese archivo.

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
| `npm run env:init` | Genera `.env` con un `AUTH_SECRET` aleatorio. No sobreescribe uno existente sin `--force` (rotar el secreto cierra las sesiones activas) |
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

### Primer despliegue, en orden

```bash
git clone <tu-repo> finanbolsa && cd finanbolsa
npm run env:init                    # genera .env con un secreto aleatorio
$EDITOR .env                        # ponle la contraseña a AUTH_PASSWORD
./deploy.sh
```

`deploy.sh` hace el trabajo completo y **no reporta éxito hasta que el contenedor
está sano**: construye, arranca las migraciones, espera el healthcheck e imprime
la URL. Si algo falla, dice qué mirar y da el comando de rollback. Un script de
despliegue que dice "listo" y miente es peor que uno que no existe.

Los pasos que hace, por si prefieres hacerlos a mano:

```bash
docker compose up -d --build
docker compose ps                   # espera a "healthy"
docker compose logs -f web          # si no levanta
```

Servicios: `web` y `backup`. El contenedor corre `npm run db:migrate` antes de
arrancar, así que **desplegar una versión con migraciones nuevas es el mismo
comando de siempre**. El volumen es `./data` en el host: la base sobrevive a los
rebuilds.

### Actualizar

```bash
./deploy.sh
```

Trae `master`, reconstruye y revalida. No hay nada en la Pi que mire GitHub por
su cuenta, así que nada llega a producción hasta que lo ejecutas tú.

**Si una migración nueva rompe la app**, el rollback es volver al commit anterior
y reconstruir. Las migraciones de drizzle no tienen `down`, así que "deshacer" la
migración significa restaurar un backup:

```bash
docker compose down
git checkout -            # deshace el pull
./deploy.sh               # el código viejo no usa las tablas nuevas
# y si la base quedó en mal estado:
#   docker compose stop web
#   cp data/backups/finanbolsa-AAAA-MM-DD.db data/finanbolsa.db
#   rm -f data/finanbolsa.db-wal data/finanbolsa.db-shm
#   docker compose run --rm web npm run db:migrate
#   docker compose up -d web
```

### Acceder desde otro dispositivo

El compose publica el puerto 3000 en la LAN (configurable con `PUERTO` en `.env`).
Entra por la IP del Pi.

Sin HTTPS a propósito: en una red de casa un certificado autofirmado solo produce
advertencias y no protege nada del tráfico que no sale del tu router. **Desde
fuera de casa sí hace falta** — ahí la cookie de sesión viaja en claro y cualquiera
en el camino puede leerla.

### HTTPS

Opt-in, con Caddy y certificado automático. Necesitas un dominio propio apuntando
a la Pi y los puertos 80/443 libres.

```bash
# en .env
DOMAIN=finanzas.ejemplo.com
ACME_EMAIL=tu@correo.com
FINANBOLSA_HTTPS=true
```

```bash
docker compose --profile https up -d
```

**Verifica esto una vez montado:** entra sin sesión y comprueba que el navegador
te lleva a `https://tu-dominio/login` y **no** a `http://localhost:3000/login`.
La redirección la arma `src/proxy.ts` a partir de la URL de la petición, así que
si Caddy no reenvía el `Host` original acabarías en un `localhost` que no existe
desde fuera. El `Caddyfile` ya incluye `header_up Host {host}` como red de
seguridad, pero es el único punto del despliegue que no se puede comprobar sin
desplegarlo.

> Mientras uses el perfil `https`, el puerto 3000 sigue publicado: quien esté en
> la LAN puede saltarse el certificado. Si prefieres cerrarlo, quita el bloque
> `ports` del servicio `web` en `docker-compose.yml`.

> **La imagen es arm64 y se compila en el Pi.** `better-sqlite3` es un addon
> nativo y no se cross-compila desde x86. En una Pi 5 o 4 va directo; en una
> Zero/1 (armv6/armv7) `node:22-bookworm-slim` no arranca y hace falta otra base.

### Cuando algo va mal

```bash
docker compose ps                    # ¿está healthy?
docker compose logs --tail=50 web    # el log va a la consola: migraciones y errores
docker compose down                  # parar sin borrar ./data
```

Tres fallos que se ven bien y no dicen nada útil:

| Síntoma | Causa |
|---|---|
| `/login` carga pero no acepta la contraseña | falta `AUTH_PASSWORD` en `.env` |
| No acepta la contraseña y estás en `http://` de la LAN | `FINANBOLSA_HTTPS=true` sin HTTPS: el navegador descarta la cookie `Secure` |
| El deploy dice que está bien y al abrir no hay nada | con el healthcheck esto ya no pasa; si ocurre, `docker compose ps` dirá `unhealthy` |

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
