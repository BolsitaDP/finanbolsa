# FinanBolsa — plan

> App de finanzas personales, self-hosted. **Destino: Raspberry Pi en Docker,
> accesible desde cualquier dispositivo.**
> Last review: 2026-09-30 · v0.1.0
>
> **La dirección de producto vive en `ROADMAP.md`; este documento lleva el
> estado de lo ya hecho y por qué se midió así.** Este cuadro se actualizó el
> 2026-09-30, después del lote de correcciones y agregación en SQL.

---

## 1. Estado

| # | Ítem | Estado |
|---|------|--------|
| 1 | Autenticación | **Hecho** — `src/proxy.ts`, login, guard en actions |
| 2 | Backups automáticos | **Hecho** — `VACUUM INTO` + servicio `backup` + simulacro de restauración probado |
| 3 | Tests de la lógica de cálculo | **Hecho** — 360 tests en verde (1 depende del ledger real) |
| 4 | Índices en `transactions` | **Hecho** — 3 índices, medidos a 50k filas |
| 5 | Paginación y filtrado en SQL | **Hecho** — `/transacciones` con URL como estado; el resto son agregados |
| 6 | Agregación en SQL | **Hecho** — `src/lib/aggregates.ts`, 3,5× en `/` a 50k filas |
| 7 | Verificación de los números | **Hecho** — tarjeta de integridad: splits que exceden y movimientos previos a la referencia |
| 8 | Producto (comparaciones, recurrentes, captura) | **Parcial** — ver `ROADMAP.md` §1–2 |
| 9 | Despliegue en la Pi | **Pendiente** — ver §3. Es lo que más importa ahora |

> **Sobre las páginas de agregación (antes "parcial"):** no se van a paginar, y
> no hace falta. `/`, `/cuentas`, `/presupuesto` y `/recurrentes` no muestran
> listas de movimientos sino totales, así que la respuesta correcta no era
> paginar sino dejar de traer 50 000 filas para reducirlas en memoria. Eso es lo
> que hizo `aggregates.ts`, y por eso el ítem era "paginación" solo a medias.

Detalle de lo hecho y sus mediciones: **Apéndice A**.

---

## 2. Qué sigue

Ordenado por riesgo, no por comodidad. El razonamiento de cada uno está en su
sección del apéndice.

### 2.1 Probar una restauración real — HECHO

**Un backup que nunca se ha restaurado no es un backup.** Era el punto más
barato de la lista y el que más rápido podía revelar un fallo grave.

**Simulacro ejecutado** (en `data/restore-test/`, aislado — la base viva nunca
se tocó):
1. Se copió el respaldo más reciente a un archivo aparte.
2. **Resultó ser un respaldo de antes de la migración `0006`** (6 migraciones y
   0 índices; la base viva tiene 7 y 3). Se corrió `db:migrate` sobre el
   archivo restaurado para traerlo al día. Ese paso —migrar un respaldo hacia
   adelante— es donde una recuperación real se rompe, y ahora está probado.
3. Se levantó una **segunda instancia** en el puerto 3100 apuntando al
   restaurado, y se comparó su salida contra la instancia viva.
4. Las **16 páginas** (dashboard, transacciones con paginación/búsqueda/orden,
   presupuesto, recurrentes, todos los listados, configuración, importar) y los
   exports JSON y CSV dieron salida **idéntica**. Cero errores de consola.

**Quedó como script reutilizable:**
`src/db/scripts/verify-backup.ts` → `npm run db:verify-backup`
(compara integridad y contenido del respaldo contra la base viva; acepta una
ruta explícita para validar un respaldo antiguo o sospechoso).

**El verificador se probó a sí mismo.** Un detector que nunca falla no sirve,
así que se le inyectó corrupción de verdad:

| Daño inyectado | `integrity_check` de SQLite | `verify-backup` |
|---|---|---|
| basura en el header | no abre | **detectado** (exit 1) |
| archivo truncado | no abre | **detectado** (exit 1) |
| basura en página **libre** | `ok` (!) | `ok` — correcto, no hay datos que perder |
| basura en página **con datos** | `malformed` | **detectado** (exit 1) |
| intacto (control) | `ok` | **pasa** (exit 0, sin falsos positivos) |

> **Lo que salió de probar el detector:** `integrity_check` verifica la
> estructura del B-tree, no que cada byte sea el que se escribió. Medido aquí:
> 4 KB de basura en una página *libre* dan `ok` **y** devuelven las 1 135 filas
> intactas. Por eso el script además **lee cada tabla de verdad**, que es lo que
> atrapa la corrupción en una página con datos. Con `integrity_check` solo
> habría dado un falso "todo bien".

**Cómo restaurar de verdad:**
```bash
docker compose stop web
cp data/backups/finanbolsa-AAAA-MM-DD.db data/finanbolsa.db
rm -f data/finanbolsa.db-wal data/finanbolsa.db-shm
docker compose run --rm web npm run db:migrate   # trae el respaldo al día
docker compose up -d web
```
El `-wal`/`-shm` se borran porque pueden contener páginas más nuevas que
pisarían el respaldo restaurado.


### 2.2 Despliegue en la Pi — §3 · **lo único que queda de esta lista**

### 2.3 Agregación en SQL para las páginas de totales — HECHO

`/recurrentes` (485 ms), `/` (513 ms) y `/presupuesto` (331 ms) a 50k filas.
No se pueden paginar: necesitan totales. Hay que empujar la agregación a
`GROUP BY` en SQL, reescribiendo `spending-stats.ts` y `recurrentes`.

**Hecho** en `src/lib/aggregates.ts`. Medido a 50 000 filas sobre el build de
producción, medianas de tres pasadas con `npm run bench`:

| Página | Antes | Después | |
|---|---|---|---|
| `/` | 408 ms | **118 ms** | 3,5× |
| `/cuentas` | 255 ms | **59 ms** | 4,3× |
| `/recurrentes` | 256 ms | **122 ms** | 2,1× |
| `/presupuesto` | 187 ms | **147 ms** | 1,3× |

`balance.ts` y `spending-stats.ts` **no se borraron**: siguen siendo la
implementación legible, y `aggregates.test.ts` comprueba contra la base real que
cada función SQL devuelve lo que devuelve su gemela en JS. Esa comparación es la
que encontró dos bugs de dinero (inventar historia en `netWorthTrend`, y meses
en UTC en `detectRecurring`).

Los índices de `category_id` y `currency` **no** se agregaron: la agregación es
por mes y los tres índices existentes ya cubren ese rango. Ver `ROADMAP.md` §4.1.

### 2.4 El markup de Tailwind es el nuevo piso — ~2 h · PENDIENTE

Con la paginación resuelta, `/transacciones` bajó de 26,4 MB a 310 KB a 50k
filas — pero 310 KB para **50 filas** es 4,7 KB por fila, casi todo clases de
Tailwind repetidas (`<td>` ~85 chars × 7 celdas; un `<span>` de badge, ~640).
El shell de la app son ~77 KB en **cada** página, constante.

Es independiente del tamaño de la base: es lo que queda cuando el dato ya no
es el problema. Opciones: reducir `PAGE_SIZE`, o extraer las clases repetidas a
un `@apply` / componente. Ver `ROADMAP.md` §5.

### 2.5 Bug de zona horaria — HECHO

Eran **tres** instancias, no una. Dos eran latentes, y **una estaba activa**: el
CSV exportaba fechas en UTC mientras la pantalla las muestra en hora local, y
**21 de 1 115 movimientos salían con un día corrido** — en la frontera de mes,
también en el mes equivocado, con el presupuesto y el CSV contando meses
distintos.

Las otras dos: `recurring.ts` agrupaba meses con `toISOString()`, y los agregados
SQL cada uno con su propia idea de mes. Ahora todo pasa por `monthKey()` (hora
local) y `transactionMonth` (su equivalente en SQL). Ver `ROADMAP.md` §3.1.

---

## 3. Despliegue en la Pi

### 3.1 Pendiente: HTTPS

Hoy `docker-compose.yml` publica `3000:3000` y la cookie de sesión viaja **en
claro**. El código ya está preparado: `FINANBOLSA_HTTPS=true` marca la cookie
como `Secure`, y está en `.env.example`.

Lo que falta es el TLS. Lo natural es **Caddy como reverse proxy** delante del
contenedor, con certificado automático. Implica:

- `web` deja de publicar el puerto hacia la LAN (o queda en `127.0.0.1`)
- Caddy enruta 443 → 3000 y resuelve el certificado de un dominio propio
- `FINANBOLSA_HTTPS=true`
- **A verificar:** el proxy (`src/proxy.ts`) construye sus redirects con
  `request.url`. Si Caddy no reenvía el `Host` original, los redirects a
  `/login` apunten a `localhost:3000` en vez de al dominio propio. Comprobarlo
  con el proxy montado, no antes.

Sin esto, la app funciona pero la sesión es interceptable en cualquier red
intermedia. Es el punto de seguridad que más importa ahora que el objetivo es
acceder desde fuera de casa.

### 3.2 Pendiente: secretos en la Pi

`AUTH_PASSWORD` y `AUTH_SECRET` salen de un `.env` en el host. Cosas a
resolver: permisos del archivo (`chmod 600`, no versionado), que el `.env` no
termine en un backup de Git, y qué rotar si la Pi se compromete (cambiar
`AUTH_SECRET` invalida todas las sesiones — es el mecanismo de revocación).

### 3.3 Riesgo conocido: el backup está en la misma tarjeta

**Documentado, no resuelto** (decisión explícita).

```
finanbolsa.db            →  ./data/          ← tarjeta SD
finanbolsa.db-backups/   →  ./data/backups/  ← la MISMA tarjeta SD
```

`VACUUM INTO` protege contra **corrupción lógica**: una importación mala, un
`DELETE` accidental, un esquema incompatible. **No** protege contra la pérdida
de la tarjeta, que es el modo de fallo más probable de una Pi.

Mitigaciones que existen hoy, sin coste:
- `/api/export?format=json` descarga un volcado que sí se puede guardar fuera
- Retención de 14 días, así que siempre hay a qué volver tras un error tonto

Si algún día se quiere cerrar del todo: sincronizar `data/backups/` a otro
equipo. Requiere que haya otro dispositivo siempre encendido; por eso no se
recomienda como primera medida.

### 3.4 Riesgo conocido: desgaste de la SD

SQLite en modo WAL hace escrituras pequeñas frecuentes (checkpoints) más un
backup diario. Para una app con unos pocos movimientos al día el volumen es bajo y la tarjeta dura años. Anotado para que no sorprenda, no para actuar.

### 3.5 Pendiente: procedimiento de actualización

`deploy.sh` hace `git pull` + `docker compose up -d --build` sobre `master`. Le
falta: qué hacer si el build falla a mitad (el contenedor viejo sigue vivo, pero
conviene saberlo), y cómo volver atrás si una migración nueva rompe la app. Con
`drizzle-kit migrate` las migraciones no tienen down, así que el rollback real
es restaurar un backup — que es exactamente por qué §2.1 va primero.

---

## 4. Producto

- **README real** — el actual es el de `create-next-app`. Esquema, decisiones de
  diseño, cómo respaldar y restaurar, cómo desplegar. *Parcial: se reescribió
  junto al lote de agregación en SQL; falta la parte de despliegue, que es justo
  lo que sigue pendiente.*
- ~~**Conversión de moneda**~~ — **Hecho**, opt-in y con TRM automática
  (`ROADMAP.md` §3.2).
- ~~**Recurrentes proyectados**~~ — **Hecho**: avisa de subidas (§1.4), proyecta
  los próximos 30 días (§1.5), registra el cargo del mes que faltaba (§2.2) y
  deja descartar los falsos positivos. No genera movimientos **futuros** a
  propósito: restingirían saldo de un día que no ha ocurrido, y taparían los
  presupuestos de meses por venir.
- **Plantilla de presupuesto** — "copiar mes anterior", rollover visible
  (el cálculo ya existe, no es visible ni configurable), presets.
- **Importador CSV/XLSX genérico** como fallback: hoy el parser solo entiende
  Bancolombia.
- **Adjuntar recibos** a las transacciones.

---

## Apéndice A — Mediciones y decisiones

Todo lo que se midió y por qué se decidió así. Conservado del plan original
porque es lo que justifica las decisiones.

### A.1 Autenticación

**Problema.** No había login, middleware ni control de sesión en `src/`. La
zona de peligro de `/configuracion` borraba todas las transacciones con solo
escribir `RESTABLECER`.

**Decisión.** Contraseña única por variable de entorno + cookie firmada con
HMAC-SHA256. Sin usuarios ni tabla de sesiones: la app es single-user por
diseño, y un esquema de identidad completo sería complejidad sin destinatario.

> En Next 16 el archivo es `src/proxy.ts`, **no** `middleware.ts` (renombrado en
> v16.0.0, `middleware` deprecado). Corre con runtime de Node.js por defecto.

**Implementación.**
- `src/lib/auth.ts` — `createSessionToken`/`verifySessionToken` (payload `{exp}`
  + HMAC, comparación en tiempo constante), `passwordMatches`.
- `src/lib/auth-session.ts` — lo que necesita `next/headers`, separado para que
  el proxy no dependa de él.
- `src/proxy.ts` — matcher que cubre páginas y `/api`, excluyendo `_next/static`,
  `_next/image`, `favicon.ico` **y `/login`**. Sin cookie → redirect a
  `/login`. `/api/*` → 401 JSON en vez de redirect.
- `src/app/login/` — página + server action.
- `assertAuthenticated()` dentro de las 7 actions destructivas de
  `configuracion/actions.ts`, y re-check en `/api/export`.

> **Por qué el guard en las actions y no solo en el proxy:** la doc de Next
> advierte que un cambio en el matcher puede dejar de cubrir una ruta en
> silencio, y que las Server Actions son POST a la ruta donde se usan. Un
> `matcher` mal escrito deja la app abierta sin ningún error visible. El proxy
> da la primera línea; las actions criticas se autorizan a sí mismas.

**Dos bugs que casi se cuelan** (documentados en el código):
- El matcher excluía assets estáticos pero **no `/login`** → bucle de redirect.
- `secure: true` incondicional hace que el login sea **imposible** por http
  plano de LAN, porque el navegador descarta la cookie. Ahora depende de
  `FINANBOLSA_HTTPS`.

**Verificación.** 14 tests de auth. Manual: sin cookie → 307 a `/login`;
`/api/export` → 401; contraseña incorrecta → rechazada con delay de 500 ms;
`/login` con sesión activa → redirige a `/`.

### A.2 Backups

**Problema.** El único respaldo era descargar el export a mano. Y el estado de
los archivos lo decía:

```
finanbolsa.db      245 KB
finanbolsa.db-wal  4.1 MB   ← casi todo el historial reciente sin consolidar
```

En WAL el `.db` solo está incompleto: copiar solo ese archivo pierde datos, y
copiar los archivos a mitad de escritura produce un respaldo corrupto.

**Decisión.** `VACUUM INTO` — backup online de SQLite: corre sobre la base
viva, respeta el WAL, y escribe un `.db` nuevo consistente y compactado. Sin
downtime y sin bloquear escrituras.

**Implementación.** `src/db/scripts/backup.ts` (`npm run db:backup`), poda a 14
días, exit code ≠ 0 si falla. Servicio `backup` en compose: misma imagen,
misma ruta de `db:migrate` ya probada, `sleep 86400` entre ejecuciones.

> Descartado: un `crond` de Alpine. Añade una imagen y una capa de
> configuración por lo que ya da un `while true; do …; sleep 86400; done`.

**Verificado.** Conteos y sumas idénticos a la base viva, `integrity_check: ok`
en las 7 tablas, y **simulacro de restauración completo con la app corriendo
sobre el respaldo** → ver §2.1. El procedimiento de recuperación está documentado
y probado.

### A.3 Tests

**Problema.** Cero tests, y la lógica de mayor riesgo son funciones puras sin
cobertura: `balance.ts` (decide el signo de cada movimiento — un error ahí
**subvierte todos los saldos** con un síntoma de número plausible, no de crash)
y `recurring.ts` (el umbral de varianza decide qué es suscripción).

**Implementación.** Vitest 3, `environment: "node"`, tests en
`src/lib/__tests__/`.

> **Vitest 5 no funciona en Windows aquí**: usa rolldown y su binding nativo no
> instala por el bug de optional-deps de npm. Se fijó `vitest@^3` (vite). Si en
> la Pi falla, es esto.

| Suite | Tests | Qué fija |
|---|---|---|
| `balance` | 14 | signos, transferencias, `referenceDate`, el "undo" de `netWorthTrend` |
| `recurring` | 12 | ambos fallos de la heurística: súpermercado no es suscripción; suscripción USD con drift de TC sí |
| `auth` | 14 | firma, expiración, rotación de secret, password incorrecto |
| `transactions-query` | 21 | clamping de la URL, escapado de `LIKE`, whitelist de `ORDER BY` |

**Los tests ya han atrapado bugs reales**, antes que el navegador:
- `DEFAULT_FILTERS` sin `dir` → la URL emitía `?dir=undefined`
- El `PAGE_SIZE` mal calibrado del primer benchmark (§A.5)

### A.4 Índices

Solo existía el PK. `budgets`, `payees` y `projects` sí lo tenían; la tabla más
consultada era la única sin cubrir.

Elegidos **midiendo**: se replicaron las filas reales a 50 000 y se compararon
seis juegos de índices con `EXPLAIN QUERY PLAN` sobre las queries que el código
realmente ejecuta.

Migración `drizzle/0006_condemned_zzzax.sql` (3 índices + `ANALYZE`):

| Índice | Query que sirve | 50k filas |
|---|---|---|
| `transactions_date_idx` | dashboard "recientes", búsqueda global | 6,0 → **0,02 ms** |
| `transactions_account_date_idx` | dedup de importación (cuenta + mes) | 6,0 → **0,28 ms** |
| `transactions_import_batch_idx` | deshacer una importación | 5,1 → **0,02 ms** |

Los tres eliminan además el `USE TEMP B-TREE FOR ORDER BY`. Coste: +33 % de
tamaño a 50k; irrelevante a 1 115 filas.

> **Corrección de método.** La primera medición dio lo contrario: `(account_id,
> date)` parecía *empeorar* la query un 40 %. La causa era el rango de fechas del
> test —1,2 años. Un extracto es **un mes**; con el rango realista el mismo
> índice pasó a ser 12-20x más rápido. Casi se descarta el índice que más rinde.

**Explícitamente NO indexado:** `category_id` y `currency`. Hoy todo total se
agrega en JS, así que ninguna query filtra por ellos a nivel SQL: el índice
costaría escrituras y no compraría nada.

### A.5 Paginación en SQL

**Lo que había.** `db.select().from(transactions)` sin `where` ni `limit` en
dashboard, transacciones, recurrentes y presupuesto; el dashboard calculaba
`netWorthTrend` recorriendo todo × todas las cuentas en cada render.

**Antes medido en condiciones idénticas** (build de producción, misma auth,
misma base, código viejo extraído de `b8e4c33`):

| | 1 115 tx | 50 188 tx |
|---|---|---|
| Payload | 750 KB | **26,4 MB** |
| gzipped | 40 KB | **1 569 KB** |
| Latencia | 119 ms | **2 253 ms** |

**Implementado en `/transacciones`:** paginación, orden y filtrado en SQL,
accionados por la URL (`?q=&type=&account=&sort=&dir=&page=`).

- `src/lib/transactions-query.ts` — lógica pura: normaliza los searchParams con
  *clamping* (no rechazo) y construye WHERE/ORDER BY/LIMIT.
- `DataTable` acepta un prop `server` opcional → `manualSorting` /
  `manualFiltering` / `manualPagination`. **Las otras 5 tablas no lo usan y
  quedan intactas.**
- Las 3 páginas de detalle (categoría, payee, proyecto) siguen en modo cliente:
  reciben un subconjunto ya acotado, así que filtrarlo en el navegador es gratis
  y evita un round-trip por tecla.
- Splits: solo los de las 50 filas en pantalla, no todos.

**Después, misma comparación:**

| | 1 115 tx | 50 188 tx |
|---|---|---|
| Payload | 750 → **329 KB** | 26,4 MB → **310 KB** |
| gzipped | 40 → **17 KB** | 1 569 → **15 KB** |
| Latencia | 119 → **57 ms** | 2 253 → **111 ms** |
| Búsqueda | 73 → **56 ms** | 1 941 → **121 ms** |

87x menos payload, 20x menos latencia a 50k. Lo decisivo no es el número
absoluto sino que **la página 10 cuesta lo mismo que la página 1**: el costo
dejó de escalar con la base.

> **Error de método.** Primero simulé el "antes" con `PAGE_SIZE = 1000000`, lo
> que dio 5,8 MB. Eso **exageraba** la mejora: el código viejo tenía
> `pageSize={20}` en cliente, así que solo renderizaba 20 filas y las otras
> 1 095 viajaban como datos. Al reconstruir el código viejo real desde git, el
> "antes" correcto fue 750 KB. Una simulación que no reproduce el código
> anterior no es un "antes".

**Tres cosas que salieron de medir, no de suponer:**
1. El markup de Tailwind es el piso real (§2.4), no los datos.
2. Los tests atraparon el bug de `dir` antes que el navegador.
3. `ORDER BY` no se puede parametrizar: la columna de la URL se resuelve contra
   un whitelist y un valor desconocido cae en `date`. Testeado con un
   `id; DROP TABLE transactions--`.

### A.6 Bug de zona horaria

`recurring.ts` agrupa meses con `date.toISOString()` (UTC); `month.ts` usa
`getFullYear()`/`getMonth()` (local). En Colombia (UTC-5) un movimiento del 1.º
después de las 7 p. m. cae en el mes **anterior** para `/recurrentes` pero en el
correcto para dashboard y presupuesto.

**Medido: 0 de 1 115 transacciones (0,00 %) afectadas.** Es un bug real pero
latente: se activa solo cuando entre un movimiento en esa franja. Ver §2.5.

Los fixtures de `src/lib/__tests__/factories.ts` evitan el problema por
construcción: mediodía UTC cae en el mismo día calendario en cualquier zona
entre UTC-12 y UTC+12, así que el test no puede fallar por la zona horaria de
la máquina que lo corre.
