# Plan de mejora — FinanBolsa

> Escrito tras la revisión del código (2026-09-26). Estado actual: v0.1.0, ~1 115
> transacciones, 8 cuentas, 44 reglas, desplegado en Raspberry Pi vía Docker.

## Estado

| # | Problema | Estado |
|---|----------|--------|
| 1 | Sin autenticación | **Hecho** — `src/proxy.ts` + login + guard en actions |
| 2 | Sin backups automáticos | **Hecho** — `VACUUM INTO` + servicio `backup` en compose |
| 3 | Tests de `balance` y `recurring` | **Hecho** — 40 tests en verde |
| 4 | Sin índices en `transactions` | Pendiente — 15 min |
| 5 | Todo en memoria, filtrado en cliente | Pendiente — ~1 día |
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

### 2.1 Índices en `transactions`

Solo existe el PK autoincremental. Todas las queries filtran por `currency`,
`date`, `category_id`, `account_id`, `deleted_at`, pero ninguna tiene índice.
`budgets`, `payees` y `projects` sí lo tienen — la tabla más consultada es la
única sin cubrir.

Índices propuestos: `date`, `(account_id, date)`, `(category_id, date)`,
`(import_batch_id)`, y un índice parcial `WHERE deleted_at IS NULL` (la
condición que aparece en casi todas las queries).

Migración drizzle nueva + `ANALYZE`. Medir antes/después con `EXPLAIN QUERY PLAN`.

### 2.2 Paginación y filtrado en SQL

`db.select().from(transactions)` sin `where` ni `limit` está en el dashboard,
transacciones, recurrentes y presupuesto. El dashboard calcula
`netWorthTrend` recorriendo todas las transacciones × todas las cuentas, en
cada render. Las tablas filtran y paginan en el cliente.

Migrar a filtros y paginación en SQL vía `searchParams`. Beneficio doble:
escala, y las URLs pasan a ser compartibles y enlazables.

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

1. **1.1 Auth** — horas. Elimina el riesgo de perder todo por un click.
2. **1.2 Backups** — una hora. Un `VACUUM INTO` y un servicio.
3. **1.3 Tests** — un par de horas. Protege los números.
4. 2.1 Índices — 15 min. Evita una cirugía futura.
5. 2.2 Paginación SQL — un día.
6. 3. Producto — cuando la base esté firme.
