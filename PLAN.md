# Plan de mejora — FinanBolsa

> Escrito tras la revisión del código (2026-09-26). Estado actual: v0.1.0, ~1 115
> transacciones, 8 cuentas, 44 reglas, desplegado en Raspberry Pi vía Docker.

## Estado

| # | Problema | Estado |
|---|----------|--------|
| 1 | Sin autenticación | **Hecho** — `src/proxy.ts` + login + guard en actions |
| 2 | Sin backups automáticos | **Hecho** — `VACUUM INTO` + servicio `backup` en compose |
| 3 | Tests de `balance` y `recurring` | **Hecho** — 40 tests en verde |
| 4 | Sin índices en `transactions` | **Hecho** — 3 índices, medidos a 50k filas |
| 5 | Todo en memoria, filtrado en cliente | **Parcial** — /transacciones hecho |
| 6 | README de `create-next-app` | Pendiente — 30 min |
| 7 | Sin conversión de moneda | Pendiente — ~1 día |
| 8 | Recurrentes read-only | Pendiente — ~4 h |
| 9 | Presupuesto sin plantilla | Pendiente — ~3 h |
| 10 | Parser acoplado a un banco | Pendiente — ~1 día |

---

## Diagnóstico resumido

| # | Problema | Impacto | Esfuerzo |
|---|----------|---------|----------|
| 1 | Sin autenticación, puerto 3000 expuesto en LAN | **Crítico** — cualquiera puede leer y borrar todo | ~3 h |
| 2 | Sin backups automáticos (WAL de 4 MB sin consolidar) | **Crítico** — pérdida de datos irrecuperable | ~1 h |
| 3 | Cero tests sobre la lógica de cálculo más delicada | **Alto** — los números de todas las páginas sin red de seguridad | ~2 h |
| 4 | Sin índices en `transactions` | Medio — full scans en cada carga | 15 min |
| 5 | Todo se carga en memoria y se filtra en el cliente | Medio — no escala, URLs no compartibles | ~1 día |
| 6 | README es el de `create-next-app` | Bajo — pérdida de contexto a futuro | 30 min |
| 7 | Sin conversión de moneda | Producto — no hay patrimonio único | ~1 día |
| 8 | Recurrentes read-only, sin proyección | Producto — mitad de la funcionalidad | ~4 h |
| 9 | Presupuesto sin plantilla ni rollover visible | Producto — fricción mensual | ~3 h |
| 10 | Parser de PDF acoplado a un solo banco | Producto — sin fallback | ~1 día |

---

## Fase 1 — Seguridad y protección de datos

### 1.1 Autenticación

**Problema.** No existe login, middleware ni control de sesión en todo `src/`.
`docker-compose.yml` publica `3000:3000`. La zona de peligro de
`/configuracion` permite borrar todas las transacciones escribiendo
`RESTABLECER` en un diálogo — sin más verificación que eso.

**Decisión.** Contraseña única por variable de entorno + cookie de sesión firmada
con HMAC-SHA256. Sin usuarios ni base de datos de sesiones: la app es
single-user por diseño, y un esquema de identidad completo sería complejidad sin destinatario.

> En Next 16 el archivo se llama `src/proxy.ts`, **no** `middleware.ts`
> (renombrado en v16.0.0; `middleware` está deprecado). El proxy corre con
> runtime de Node.js por defecto.

**Implementación.**
- `src/lib/auth.ts` — `signSession`/`verifySession` (payload `{exp}` + HMAC,
  comparación en tiempo constante), `passwordMatches`, `AUTH_SECRET` /
  `AUTH_PASSWORD` con validación de arranque.
- `src/proxy.ts` — matcher que cubre páginas y `/api`, excluyendo solo
  `_next/static`, `_next/image` y `favicon.ico`. Sin cookie válida → redirect a
  `/login`. `/api/*` sin sesión → 401 JSON en vez de redirect.
- `src/app/login/page.tsx` + server action `loginAction`.
- **`assertAuthenticated()` dentro de las server actions destructivas** de
  `src/app/configuracion/actions.ts`.

> **Por qué el guard en las actions y no solo en el proxy:** la doc de Next
> advierte que un cambio en el matcher puede dejar de cubrir una ruta, y que
> las Server Actions son POST a la ruta donde se usan. Un `matcher` mal
> escrito deja la app abierta sin error visible. Por eso el proxy da la
> primera línea de defensa y las actions criticas se autorizan a si mismas.

**Estructura de rutas.** Para que `/login` no herede el shell con sidebar, la
app se reorganiza en un route group `(app)/`: el layout raíz queda solo con
`html`/`body`/`Toaster`, y el shell (sidebar + header + search) pasa a
`src/app/(app)/layout.tsx`. Los route groups no afectan la URL, así que
ningún enlace cambia.

**Configuración.** `.env.local` gana `AUTH_PASSWORD` y `AUTH_SECRET`
(`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
`docker-compose.yml` las pasa como `environment:`. Si faltan, la app
**arranca igual pero rechaza todo** en vez de fallar al boot — un error
explícito en el log es más fácil de diagnosticar que un 500 en cada request.

**Verificación.** `npm test` cubre firma/verificación de sesión, expiración,
password incorrecto. Manual: request sin cookie → 302 a `/login`;
`curl /api/export?format=json` sin cookie → 401.

---

### 1.2 Backups automáticos

**Problema.** El único respaldo es descargar `/api/export?format=json` a mano.
Y el estado actual del archivo es elocuente:

```
finanbolsa.db      245 KB
finanbolsa.db-wal  4.1 MB   ← casi todo el historial reciente sin consolidar
```

En modo WAL el `.db` por sí solo está incompleto. Un backup que copie solo el
`.db` pierde datos; uno que copie los archivos a mitad de escritura produce un
archivo corrupto.

**Decisión.** `VACUUM INTO` — el mecanismo de backup online de SQLite. Corre
sobre la base viva, respeta el WAL, y escribe un `.db` nuevo ya consistente y
compactado. No requiere detener la app ni bloquear escrituras.

**Implementación.**
- `src/db/scripts/backup.ts` — `VACUUM INTO` a `data/backups/finanbolsa-YYYY-MM-DD.db`,
  poda a los últimos 14 respaldos, loga tamaño y ruta. Fallo en cualquier
  paso → exit code distinto de 0 (para que el cron lo note).
- `npm run db:backup`.
- Servicio `backup` en `docker-compose.yml`: la misma imagen, `sh -c` con un
  `sleep` de 24 h entre ejecuciones. Corre al arrancar el contenedor y luego
  una vez al día, drifting con la hora de inicio.

> Alternativa considerada y descartada: un `crond` de Alpine. Añade una
> imagen de 8 MB y una capa de configuración por la misma funcionalidad que da
> un `while true; do …; sleep 86400; done`. Para un contenedor que corre
> exactamente una vez al día, no vale la pena.

**Verificación.** Correr el script, abrir el `.db` generado con `sqlite3` y
contar filas de `transactions` — deben coincidir con la base viva. Comprobar
que tras 2 ejecuciones la poda deja solo el respaldo del día.

---

## Fase 1.5 — Red de seguridad sobre los cálculos

### 1.3 Tests de `balance` y `recurring`

**Problema.** No hay un solo test en el repo, y la lógica de mayor riesgo vive
en funciones puras sin cobertura:

- `src/lib/balance.ts` — `movementFor` decide el signo de cada transacción. Un
  error aquí **subvierte todos los saldos y todo el patrimonio neto** de la
  app, y el síntoma es un número plausible pero equivocado, no un crash.
- `src/lib/recurring.ts` — el coeficiente de variación decide qué se reporta
  como suscripción. Un umbral mal aplicado marca el supermercado como
  recurrente.

Ambas son funciones puras sin dependencias de DB: la mejor relación
valor/esfuerzo que ofrece el proyecto.

**Implementación.** Vitest (`environment: "node"`, solo lo que hay que testear
es lógica pura; no componentes). `npm test` en modo `run`, `npm run test:watch`
para el ciclo local. Tests colocados junto al código en `src/lib/__tests__/`.

**Casos a cubrir en `balance`** — cada uno ata una decisión documentada en el
código a un número esperado:

| Caso | Por qué importa |
|---|---|
| Expense resta, income suma | la fórmula base |
| Transfer: resta del origen, suma al destino | si falla, aparece dinero duplicado |
| Transfer con `destinationAmountMinor` distinto | conversión entre monedas |
| movements **anteriores** a `referenceDate` se ignoran | el ancla de la cuenta |
| `netWorthTrend` reconstruye el saldo hacia atrás | si el "undo" está mal, la gráfica miente |
| La serie de `netWorthTrend` es coherente con `currentBalances` | consistencia interna: el último punto debe ser el saldo actual |

**Casos a cubrir en `recurring`:**

| Caso | Por qué importa |
|---|---|
| 3 meses con monto estable → recurrente | el camino feliz |
| 2 meses → no es recurrente | `MIN_MONTHS` |
| Grocery store con montos variables → **no** es recurrente | el falso positivo que motiva el umbral |
| Suscripción USD cobrada en COP con drift de TC → **sí** es recurrente | tolerancia de FX |
| Se ignoran ingresos y transfers | solo gastos cuentan |
| Agrupa por payee antes que por descripción | misma compra descrita de dos formas |

**Verificación.** `npm test` en verde. Los tests describen el comportamiento
actual — si alguno falla, es un hallazgo: o el código tiene un bug, o el test
codificó mal la regla. En ambos casos se investiga antes de "arreglar" el test.

---

## Hallazgo nuevo (surge al escribir los tests)

**`recurring.ts` y `month.ts` no coinciden en zona horaria.** `recurring.ts`
agrupa meses con `date.toISOString().slice(0, 7)` (UTC); `month.ts` usa
`getFullYear()`/`getMonth()` (hora local). En Colombia (UTC-5) un movimiento del
1.º de mes a las 8 p. m. local cae en el mes **anterior** para la detección de
recurrentes, pero en el mes correcto para el presupuesto y el dashboard. Un
suscripción que se cobra el día 1 después de las 7 p. m. se contabiliza en dos
meses distintos según la página donde se mire.

No se corrigió aquí a propósito: cambiarlo altera los resultados de
`/recurrentes` y merece su propio PR con tests que lo demuestren. Los tests
nuevos usan fechas a mediodía UTC justamente para que este desajuste no se
manifeste como un fallo falso.

Los fixtures de `src/lib/__tests__/factories.ts` evitan el problema por
construcción: mediodía UTC cae en el mismo día calendario en cualquier zona
entre UTC-12 y UTC+12.

---

## Fase 2 — Escalabilidad

### 2.1 Índices en `transactions` — HECHO

Solo existía el PK autoincremental. `budgets`, `payees` y `projects` sí lo
tenían; la tabla más consultada era la única sin cubrir.

Los índices se eligieron **midiendo**, no suponiendo: se replicaron las filas
reales a 50 000 y se compararon seis juegos de índices con `EXPLAIN QUERY
PLAN` sobre las queries que el código realmente ejecuta.

**Migración `drizzle/0006_condemned_zzzax.sql`** (3 índices + `ANALYZE`):

| Índice | Query que sirve | 50k filas |
|---|---|---|
| `transactions_date_idx` | dashboard "recientes", búsqueda global | 6,0 ms → **0,02 ms** |
| `transactions_account_date_idx` | dedup de importación (cuenta + mes) | 6,0 ms → **0,28 ms** |
| `transactions_import_batch_idx` | deshacer una importación | 5,1 ms → **0,02 ms** |

Los tres además eliminan el `USE TEMP B-TREE FOR ORDER BY` que tenían. Coste:
+33 % de tamaño de base a 50k filas (medido); a las 1 135 filas actuales es
irrelevante.

**Una corrección de método que vale la pena registrar.** La primera medición dio
un resultado *contrario*: el índice `(account_id, date)` llegaba a empeorar la
query un 40 %. La causa fue el rango de fechas del test — 1,2 años. Un extracto
bancario es **un mes**; con el rango realista el mismo índice pasó a ser 12-20x
más rápido. Un benchmark con un parámetro irreal puede cancelar la decisión
equivocada.

**Lo que los índices NO arreglan.** La query más cara del sistema es
`SELECT * FROM transactions WHERE deleted_at IS NULL` (dashboard, presupuesto,
transacciones, recurrentes, proyectos, export): **~80-113 ms a 50k filas**, y
no mejora con ningún índice — tiene que leer todas las filas de todas formas.
Es 10x más cara que cualquier otra query. Eso no es un problema de índices sino
de arquitectura, y es el punto 2.2.

**Explícitamente NO indexado:** `category_id` y `currency`. Hoy todo total de
presupuesto y dashboard se agrega en JS, así que ninguna query filtra por ellos
a nivel SQL — un índice ahí costaría escrituras y no compraría nada. Se
justifica el día que el filtrado baje a SQL.

### 2.2 Paginación y filtrado en SQL — HECHO (parcial)

**Contexto de destino:** Raspberry Pi en Docker,acceso desde cualquier dispositivo.
Eso fija dos Costs que no existen en localhost: la CPU del Pi (débil, y con
almacenamiento lento) y el ancho de banda (cada visita cruza la WAN).

**Lo que había.** `db.select().from(transactions)` sin `where` ni `limit` en el
dashboard, transacciones, recurrentes y presupuesto; el dashboard calculaba
`netWorthTrend` recorriendo todas las transacciones × todas las cuentas en cada
render; las tablas filtraban y paginaban en el navegador.

**Medición del antes, en las mismas condiciones** (build de producción, misma
auth, misma base; código viejo extraído de `b8e4c33`, no una simulación):

| | 1 115 tx | 50 188 tx |
|---|---|---|
| Payload `/transacciones` | 750 KB | **26,4 MB** |
| gzipped | 40 KB | **1 569 KB** |
| Latencia | 119 ms | **2 253 ms** |

**Implementado en `/transacciones`:** paginación, orden y filtrado en SQL,
accionados por la URL (`?q=&type=&account=&sort=&dir=&page=`).

- `src/lib/transactions-query.ts` — lógica pura y testeable: normaliza los
  searchParams (con *clamping*, no rechazo), y construye WHERE/ORDER BY/LIMIT.
- `DataTable` acepta un prop `server` opcional que activa `manualSorting` /
  `manualFiltering` / `manualPagination` de TanStack. **Las demás tablas no lo
  usan y siguen igual** — blast radius cero.
- Las 3 páginas de detalle (categoría, payee, proyecto) siguen en modo cliente:
  reciben un subconjunto ya acotado, filtrarlo en el navegador no cuesta nada y
  evita un round-trip por tecla.
- Splits: ahora solo se cargan los de las 50 filas en pantalla, no todos.

**Resultado medido, misma comparación:**

| | 1 115 tx | 50 188 tx |
|---|---|---|
| Payload | 750 → **329 KB** | 26,4 MB → **310 KB** |
| gzipped | 40 → **17 KB** | 1 569 → **15 KB** |
| Latencia | 119 → **57 ms** | 2 253 → **111 ms** |
| Búsqueda | 73 → **56 ms** | 1 941 → **121 ms** |

87x menos payload y 20x menos latencia a 50k. Lo decisivo no es el número
absoluto sino que **la página 10 cuesta lo mismo que la página 1** (95 ms vs
111 ms): el costo ya no escala con la base.

**Un error de método que casi falseaba la medición.** Primeramente simulé el "antes"
poniendo `PAGE_SIZE = 1000000`, lo que dio 5,8 MB. Eso **exageraba** la mejora:
el código viejo tenía `pageSize={20}` en cliente, así que solo renderizaba 20
filas y las 1 095 restantes viajaban como datos en el flight payload. Al
reconstruir el código viejo real desde git, el "antes" correcto fue 750 KB, no
5,8 MB. Una simulación que no reproduce el código anterior no es un "antes".

**Tres cosas que aprendí midiendo, no suponiendo:**

1. **El markup de Tailwind es el piso real, no los datos.** 50 filas pesan
   310 KB porque cada `<td>` repite ~85 caracteres de clases y un `<span>` de
   badge se lleva ~640. El shell de la app son ~77 KB en cada página,
   constante. Es el siguiente cuello de botella, y es independiente del tamaño
   de la base.
2. **Los tests atraparon un bug antes del navegador.** `DEFAULT_FILTERS` no
   incluía `dir`, así que el default era `undefined` y `filtersToQueryString`
   emitía `?dir=undefined`.
3. **`ORDER BY` no se puede parametrizar**, así que el nombre de columna que
   llega por la URL se resuelve contra un whitelist. Un valor desconocido cae
   en `date` en vez de llegar al SQL. Está testeado explícitamente.

**Lo que queda (pendiente, y es lo siguiente en prioridad):**

`/recurrentes` (621 KB, 485 ms a 50k), `/` (513 ms) y `/presupuesto` (331 ms).
Estas tres **no se pueden paginar** — necesitan totales, no filas. El arreglo es
empujar la agregación a SQL (`GROUP BY`), que ya no es "paginación" sino
reescribir `spending-stats.ts` y `recurrentes` como queries de agregación.
Ahí es donde los índices de `category_id` y `currency` del punto 2.1 empiezan a
justificarse.

| 5 | Paginación en SQL | **Parcial** — `/transacciones` hecho; faltan las páginas de agregación |

---

## Fase 3 — Producto

- **README real** — esquema, decisiones de diseño, cómo respaldar y restaurar.
- **Conversión de moneda** — tabla de tasas (manual por mes es suficiente).
  Sin esto, "Patrimonio neto" son tres gráficas separadas.
- **Recurrentes proyectados** — próximos meses, alertas de subida de precio,
  generación opcional del movimiento del mes.
- **Plantilla de presupuesto** — "copiar mes anterior", rollover visible,
  presets.
- **Importador CSV/XLSX genérico** como fallback al parser de PDF, que hoy
  solo entiende Bancolombia.
- **Adjuntar receipts** a transacciones.

---

## Orden de ejecución

1. ~~**1.1 Auth**~~ — **hecho**. `src/proxy.ts` + login + guard en actions.
2. ~~**1.2 Backups**~~ — **hecho**. `VACUUM INTO` + servicio `backup`.
3. ~~**1.3 Tests**~~ — **hecho**. 40 tests en verde.
4. ~~2.1 Índices~~ — **hecho**. 3 índices, migration `0006`.
5. 2.2 Paginación SQL — ~1 día. **El cuello de botella real**: 80-113 ms por
   carga de página a 50k filas, sin arreglo posible con índices.
6. 3. Producto — cuando la base esté firme.
