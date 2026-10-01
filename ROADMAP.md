# FinanBolsa — hoja de ruta de producto

> Documento de **dirección futura**. No es una lista de pendientes: es el
> criterio con el que se decide qué se construye.
> Opera junto a `PLAN.md` (que lleva el estado de lo ya hecho y sus
> mediciones). Fecha: 2026-09-27.

---

## Cómo se decidió esta hoja de ruta

Dos fuentes, complementarias:

1. **Recorrer la app como usuario.** Abrí cada pantalla, inicié sesión, abrí
   el diálogo de edición, miré los estados vacíos. Lo que se siente al usarla.
2. **Medir, no suponer.** Payloads, latencias y query plans a 1 115 y a 50 000
   filas. Los números de rendimiento son de `PLAN.md` §A.

3. **Un análisis de arquitectura por código** (subagente, con lectura de
   archivos). Encontró los bugs de §0.7, que no son de uso sino de
   **corrección del dinero** — los verifiqué uno por uno antes de incluirlos.

### Lo que ya está bien (no tocar)

Antes de listar qué falta, lo que **no** hay que rehacer:

- **`src/lib/` está bien factorizado.** 55 exports repartidos en archivos de
  responsabilidad única (`format`, `month`, `balance`, `splits`,
  `spending-stats`, `rules`, `recurring`, `merchant`). Acoplamiento bajo.
- **Los comentarios explican el *porqué*, no el *qué*.** El truco de
  `globalThis.pdfjsWorker`, el `autoResetPageIndex: false`, la tarjeta de
  crédito como saldo negativo: son decisiones que alguien entendió y dejó
  escritas. Eso vale más que la mayoría del código.
- **Las Server Actions ya son una buena capa de servicio.** Con 61 tests sobre
  funciones puras, la base es sound.
- **Los gráficos de tendencia ya existen y funcionan** —
  `monthly-trend-chart`, `category-breakdown-chart`, `net-worth-chart`. No hay
  que escribirlos, hay que **exponerlos donde sirven**.

---

## Principios

Cuatro reglas para decidir. Si una feature no cumple alguna, no entra.

1. **Menos pasos para lo frecuente.** Agregar un gasto o corregir una categoría
   son las dos acciones de la semana. Todo lo demás puede esperar.
2. **La app responde preguntas, no muestra números.** "$ 412.000" no es una
   respuesta. "Gastaste 18 % más que el mes pasado, casi todo en restaurantes"
   sí. Un número sin contexto obliga a la calculadora mental.
3. **Nada de datos que el usuario no pueda corregir.** Si un cálculo se pone
   raro, tiene que haber una forma de arreglarlo a mano.
4. **La corrección de una fila importa más que la captura de cien.** El error
   de una categoría propagada a 6 meses de presupuesto es más caro que el
   tiempo deTECLATECLADO de capturar.

---

## Fase 0 — Quitar la fricción que ya medí

Todo esto lo vi usando la app. Effort: **S** cada uno. Es lo de mejor
valor/esfuerzo del documento.

### 0.1 El diálogo de edición estaba mal priorizado — HECHO

**El problema.** Abrir "Editar transacción" y contar los campos: Tipo → **Fecha**
→ Cuenta → **Categoría** → Monto → Moneda → Payee → Descripción → Proyecto.

La **fecha ocupa 6 controles y 5 líneas** (mes, día, año, hora, minuto,
AM/PM) y empuja la categoría a la posición 4 de 9. Pero el motivo real por el
que se abre ese diálogo ~es corregir la categoría o el monto.

**El arreglo.** Campo de fecha simple (`dd/mm/aaaa`), y la hora solo si el tipo
es transferencia o si se edita una transacción ya existente que la tenga. La
**categoría sube a posición 2**. Además, mover "Proyecto/Viaje" fuera del camino
común (ya está en su propia sección y casi siempre es "Ninguno").

### 0.2 Atajo para corregir la categoría — HECHO

Un click en la categoría de la fila abre un selectorinline, sin entrar al
diálogo completo. Es la operación más frecuente de la app y hoy cuesta 6 pasos
(tabla → scroll → lápiz → scroll en el diálogo → elegir → guardar).

### 0.3 Estados vacíos que explican su causa — HECHO

Hoy `/presupuesto` en septiembre muestra **$ 0** en "para presupuestar" y nada
más. Cero es un dato correcto pero no es una explicación: el usuario no sabe si
es que no hay nada presupuestado todavía, que no se registró ningún movimiento,
o que está mirando el mes equivocado.

Cada estado vacío debería responder por qué está vacío y ofrecer el siguiente
paso: *"No hay movimientos en septiembre de 2026"* + botón **Importar extracto**
o **Agregar el primero**.

### 0.4 Corregir "Septiembre De 2026" — HECHO

`monthLabel()` usa `toLocaleDateString("es-CO", { month: "long" })`, que
devuelve *"Septiembre de 2026"* con la S mayúscula. En español va en minúscula
salvo inicio de frase. Afecta al selector de mes del presupuesto y a cualquier
otro sitio donde se use.

### 0.5 Deshacer en vez de confirmar — HECHO

Eliminar una transacción pide confirmación y luego es irreversible.
`sonner` ya está instalado (los toasts existen en toda la app). Un
**toast con "Deshacer" durante 5-8 segundos** elimina el diálogo de confirmación
y hace la acción reversible de verdad. `softDelete` ya está: revertir es
`deletedAt = null`.

**Y aquí hay una inconsistencia de fondo que hay que cerrar:** la página de
configuración dice que la zona de peligro "no se puede deshacer", pero las
transacciones se borran de forma **suave** y sin avisar. O el `soft delete` se
vuelve reversible de verdad (esta opción), o deja de ser `soft delete`. Hoy la
app promete una cosa y hace otra, y el `soft delete` da una falsa sensación de
seguridad. Effort **M** (la action de restaurar es S; el resto es UX).

### 0.6 Estados de carga y de error — HECHO (error.tsx)

Ninguna de las mutaciones muestra estado de "guardando". Con la base de datos
en una Pi, una escritura puede tardar; el usuario necesita ver que pasó algo.
`useFormStatus` / `useTransition` en cada acción. Y un `error.tsx` global: ahora
un error de DB en una Server Action es una pantalla en blanco.

### 0.7 Bugs de corrección del dinero ⬅ verificados en el código

Estos no son problemas de uso: son **números que mienten**. Van primero por eso.

Estos son los que un análisis de código encontró y yo verifiqué uno a uno.
No son fricción: son números que mienten. Van primero por eso.

**(a) El bulk edit puede borrar dinero del patrimonio.** Effort **S**. — **HECHO**
`bulk-edit-transactions-dialog.tsx:85-93` — el campo "Cuenta destino" es
independiente del campo "Tipo". Se pueden marcar 50 filas como `transfer` sin
destino, y quedan con `destinationAccountId = null`. Entonces
`movementFor` (`balance.ts:15-23`) resta del origen y **nunca acredita a
nadie**: la transferencia debita y no deposita, y el patrimonio baja sin que
exista movimiento visible. Un campo dependiente del otro lo evita de raíz.

**(b) El presupuesto ignora en silencio lo que no esté en la moneda base.** — **HECHO**
Effort **M**. `presupuesto/page.tsx:44` filtra `where currency = baseCurrency`,
sin conversión en ninguna parte de `src/`. Un gasto en USD **nunca descuenta de
un sobre en COP**, sin aviso. Y cambiar la moneda base en Configuración rompe
el presupuesto sin preguntar. Es el peor tipo de error financiero: te da
confianza. Depende de 3.2 (conversión).

**(c) El bulk edit no limpia los splits.** Effort **S**. — **HECHO (parcial: ahora avisa)**
`bulkUpdateTransactions` (`transacciones/actions.ts:85`) hace un `UPDATE` plano;
los splits solo se reemplazan en `updateTransaction` vía `replaceSplits`.
Recategorizar en masa una transacción con splits deja los splits apuntando a la
**categoría vieja**, y `categoryAllocations` sigue atribuyendo el gasto allí.
Estadísticas y presupuesto quedan mal, en silencio.

**(d) La precedencia de las reglas es indeterminada.** Effort **S**. — **HECHO**
El motor depende de `sortOrder` (`importar/actions.ts:70`), pero
`createRule` asigna `maxOrder + 1` y **toda regla creada por la importación
escribe `sortOrder: 999`** (`importar/actions.ts:303`). Con 44 reglas y
empates, cuál gana depende del orden de filas de SQLite. No hay UI que muestre
ni cambie el orden, así que el usuario **no puede entender ni arreglar** por qué
una regla sobrescribió otra. Effort **S** para hacer el orden visible y
arrastrable.

**(e) El input de presupuesto no se resincroniza al cambiar de mes.** Effort **S**. — **HECHO**
`budget-amount-input.tsx:18` — `useState(initial)` sin sincronizar. El
`MonthSwitcher` cambia `?month=`, el servidor re-renderiza con un `initial`
nuevo, pero el componente se reutiliza y **sigue mostrando el monto del mes
anterior**. Escribes encima y el `onBlur` (`:21`) sobrescribe el mes nuevo con
el valor viejo. Sin toast de éxito, tampoco sabes que guardó.

**(f) Desbloquear la navegación por mes que ya existe.** Effort **S**. — **PENDIENTE**
`month-switcher.tsx` está conectado solo a `/presupuesto`. Pero
`categorias/[id]`, `payees/[id]` y `proyectos/[id]` **las tres leen `?month=`** y
las tres renderizan un chip "Filtrado por …". Ese filtro es **inalcanzable
salvo editando la URL a mano**. La pieza existe, funciona, y no está conectada.

**(g) Enums en inglés en la UI en español.** Effort **S**. — **HECHO (cuentas; falta resto)**
`{row.original.status}`, `{row.original.kind}`, `{tx.type}` y
`a.type.replace("_"," ")` se renderizan crudos, y los pickers de bulk edit
muestran `"credit card"`, `"active"`, `"expense"`. `lib/enums.ts` ya tiene
`ACCOUNT_STATUSES` y `TRANSACTION_TYPE_LABELS`; solo falta usarlos.

**(h) "Filas por página" es un no-op en `/transacciones`.** Effort **S**. — **PENDIENTE**
El selector persiste un valor en localStorage que la app nunca vuelve a leer
— el tamaño no va en la URL. O se manda a la URL, o se quita el selector.

**(i) Borrar una cuenta con movimientos revienta con un error de SQLite.** Effort **S**. — **HECHO**
`cuentas-table.tsx:136` avisa literalmente *"Esto puede fallar si tiene
transacciones asociadas"* — se le está ofreciendo al usuario un botón que se
sabe que va a fallar. `deleteAccount` (`cuentas/actions.ts:37`) no desenlaza
transacciones, así que la FK revienta con un error crudo en inglés. Lo
correcto: **convertir "borrar" en "archivar"** — `status` ya existe
(`archived`) y no rompe nada. Ocultar el botón destructivo cuando la cuenta
tiene movimientos es el parche mínimo.

**(j) Ninguna Server Action valida nada.** Effort **M**. — **HECHO (transacciones)**
Los 7 diálogos client re-declaran su schema zod desde cero, y el tipo es solo
de compilación sobre un endpoint `"use server"`. `bulkUpdateTransactions`
aceptaría `type: "banana"` sin quejarse. Toda la validación vive duplicada en
el cliente y ausente en el servidor — que es donde importa. Se resuelve con
zod compartido en `src/lib/schemas.ts`, importado por ambos lados.

**(k) `transactions.updatedAt` nunca se escribe.** Effort **S**. — **HECHO**
El campo existe (`schema.ts:106`) con default, y ninguna action lo actualiza
— ni create, ni update, ni bulk, ni importación. Siempre vale `createdAt`. Un
campo que miente sobre la frescura de un dato es peor que no tenerlo.

---

## Fase 1 — Que la app responda preguntas

El salto de "registro" a "herramienta". Effort: **M**–**L**.

### 1.0 La vista que faltaba: "sin categoría" — HECHO

**Este es el hallazgo con más impacto del análisis.** El trabajo semanal real
es revisar lo nuevo y **categorizar lo que quedó sin categoría** — y la app no
ofrece ninguna lista de eso. `TransactionFilters` (`transactions-query.ts:46-53`)
ni siquiera tiene un parámetro `category`. Lo único que se acerca es escribir el
nombre de la categoría en el buscador, y funciona por accidente porque `q`
matchea `categories.name`.

Hoy para accomplishes eso vas a `/transacciones` y escaneas visualmente los
"—" a través de páginas de 50 filas. Es la tarea que justifica abrir la app.

Arreglo: un parámetro `category` (y `uncategorized=true`) en los filtros
existentes, más un acceso directo en la barra lateral ("Sin categoría · 12") y
un filtro rápido por tipo. Effort **M**, y usa toda la infraestructura de
paginación por URL que ya existe.

### 1.1 Comparación mes contra mes — HECHO

Tarjeta nueva en el dashboard: **¿En qué gastaste más?**, con el mes actual
contra el anterior, categoría por categoría y **el delta en pesos**.

El delta porcentual que ya existed no contestaba la pregunta: un +40% no dice
si fueron 20.000 o 2.000.000, y una categoría nueva es una división por
cero. Aquí los pesos mandan y el porcentaje es una nota al pie, solo cuando
tiene sentido calcularlo.

Tres detalles que no son detalles:

- **Las categorías que desaparecieron también aparecen**, con delta negativo.
  Sin eso, el gasto total solo podría subir, y la tarjeta mentiría sobre lo
  que mejor hiciste.
- **Agrupado por moneda**, y con la conversión apagada solo se compara la moneda
  base, con la misma regla callada que el presupuesto: sumar dólares a pesos sin
  tasa haría del delta una ficción.
- **Server component**: son cuatro números por fila, no hace falta enviar
  JavaScript al cliente para pintar una flecha.

`buildCategoryDeltas` es pura y está en `src/lib/__tests__/month-over-month.test.ts`
(7 tests), incluido el caso de la categoría nueva, la que desaparece y la que
no se mueve.

Lo que **no** se hizo: la gráfica `MonthlyTrendChart` no se puso en el
dashboard. Con un solo mes de comparación ya responde la pregunta, y una
gráfica de tendencia en el inicio sería una pantalla más antes de llegar
a ella. Effort **S**.
### 1.2 Resumen del mes: “a dónde fue mi plata” — HECHO

Una frase por moneda sobre el total del mes: *«En agosto de 2026 gastaste
$ 1.234.567 COP, 25% más que en julio de 2026. El mayor incremento fue
Nightclub (+$ 180.000).»*

Se arma con los deltas que la tarjeta de comparación (§1.1) ya calcula, así
que no puede discrepar de la tabla de debajo. `summarizeMonth` es pura y tiene
10 tests, todos sobre los casos que salen mal:

- **División por cero.** Un mes sin anterior no tiene porcentaje, y decirlo es
  mejor que `Infinity%`.
- **Solo una causa.** Nombrar tres convierte la frase en una lista, y la lista
  ya está debajo.
- **Sin moneda repetida.** La frase nombra COP una vez; repetirla en cada
  cláusula es justo lo que hace que una línea para leer de un vistazo no lo sea.
- **Igual que el mes anterior** se dice literalmente, no como 0% redondeado.

Effort **M**, hecho.
### 1.3 Alerta de gasto fuera de lo normal

*"Este mes gastaste 3,2x tu promedio en la categoría Compras"*. Detecta el valor
atípico comparando contra el promedio de los últimos 6 meses de esa categoría.
Es el tipo de cosa que detecta una fuga pequeña antes de que sea grande.
Effort **M**.

### 1.4 Alerta de suscripción que sube de precio

`recurring.ts` ya agrupa suscripciones y calcula el promedio. Falta comparar
el **último monto contra el promedio histórico** y avisar: *"Netflix subió de
$35.000 a $42.000"*. Es el número que más duele y el más fácil de ver.
Effort **S** — ladata ya está calculada.

### 1.5 Lo que viene este mes

Usando los recurrentes detectados, proyectar el gasto de los próximos 30 días
y mostrar "gastos previstos ≈ $340.000". Convierte `/recurrentes` de un
listado en un pronóstico. Effort **M**.

### 1.6 Ranking de comercios

*"Tus 5 comercios principales este mes"*, con total y variación contra el mes
anterior. Effort **S** — es un `GROUP BY payee`.

---

## Fase 2 — Captura sin fricción

Effort: **M**–**L**. El objetivo: capturar un gasto en menos de 10 segundos.

### 2.1 Entrada rápida por texto natural

Escribir `rappi 22500` y que la app infiera payee (Rappi), monto (22 500),
categoría (la última usada con ese payee) y cuenta (la por defecto). Es el
feature que más uso generaría y el más barato: la inferencia de categoría por
payee **ya se puede hacer con las reglas existentes** (`rules.ts`). Effort
**L**, pero es la pieza que convierte la app en algo que usas a diario.

### 2.2 Plantillas de transacción recurrente

Hoy `recurrentes` **detecta** gastos que se repiten pero no permite **crear**
uno. Debería poder: "convertir esto en recurrente" → genera los movimientos de
los próximos 3 meses. Con eso `/recurrentes` deja de ser un informe retroactivo
y pasa a ser una herramienta de planificación. Effort **M**.

Tres problemas del detector que hay que arreglar de paso (Effort **S** cada uno,
todos en `recurring.ts` + la página):

- **El agrupamiento no coincide con el de la importación.** `recurring.ts:43`
  agrupa por payee o, si no hay, por **descripción cruda en minúsculas**; pero
  el importador agrupa por `cleanMerchantName` y guarda la descripción
  **original** (`importar/actions.ts:57, 277`). Es decir: la detección
  **descarta justo la normalización que el import sí hizo**. Un mismo comercio
  con tres redacciones distintas en el PDF = tres grupos, ninguno recurrente.
- **El promedio mezcla todos los años.** `averageAmountMinor` es el promedio de
  todo el histórico, sin ventana. Una suscripción que subió de 20k a 60k hace
  dos años reporta un "estimado mensual" que nunca se pagó.
- **No se puede descartar un falso positivo.** No hay forma de decir "este no
  es una suscripción" y que deje de aparecer. Con el umbral actual, cualquier
  comercio con ≥3 meses se cuela. Y las canceladas hace 8 meses siguen
  listadas como activas, sin un "no aparece desde hace N meses" — que es
  justo la señal que `categorias/[id]` ya calcula para categorías.

### 2.3 Desglose rápido de un retiro

Un retiro de efectivo es un solo movimiento lump por 300 000. Semanas después
el usuario recuerda que 120 000 fue un mercado y 80 000 una cena. Hoy el split
existe pero hay que entrar al diálogo completo para agregarlo. Un
**"Desglosar" rápido** en la fila, con los splits usados recientemente
sugeridos. Effort **S**–**M**.

### 2.4 Sugerencias de categoría mientras escribes

Hoy el motor de reglas existe (`applyRulesToTransactions`) pero se ejecuta en
lote desde una tabla, no **mientras se digita**. Aplicar la regla en el
momento del guardado evita tener que corregir después — que es el principio 4.
Effort **S**, reutilizando `rules.ts`.

### 2.5 Advertencia de duplicado

El importador ya detecta duplicados por firma. Falta al **captura manual**: si
el mismo payee + monto + fecha ya existe, avisar antes de crear. Effort **S**.

---

## Fase 3 — Que los números sean correctos

Un error aquí no cuesta fricción, cuesta plata mal entendida.

### 3.1 Bug de zona horaria — HECHO

Había **tres** instancias, no una. Las tres cerradas:

1. **`recurring.ts` agrupaba meses en UTC** con `toISOString()`. Corregido a
   `monthKey()`. Un cargo del 31 a las 8 p. m. contaba como mes siguiente.
2. **Los agregados SQL** cada uno con su propia idea de mes. Ahora todos usan
   `transactionMonth` de `month-sql.ts`, que reproduce `monthKey()`.
3. **El CSV exportaba fechas en UTC** mientras la pantalla las muestra en hora
   local: `formatDate` no fija `timeZone`, así que `Intl` usa la zona del
   proceso. Medido en los datos reales: **21 de 1.115 movimientos salían con
   un día corrido**, y en la frontera de mes también en el mes equivocado — el
   presupuesto y el CSV contando meses distintos. Corregido reutilizando
   `toDateInputValue`, que ya era el formateador local canónico, y con 5 tests
   que fijan la frontera de mes y el round-trip con el import.

`monthKey()` (local) y `transactionMonth` (SQL) son ahora la única
definición. Ver también §4.2.
### 3.2 Conversión de moneda — HECHO (opt-in, con TRM automática)

Hoy la app agrupa por moneda y **no convierte**. "Patrimonio neto" son N
gráficas separadas, no un número. Con TRM manual mensual (basta, no hace falta
API) se puede dar un patrimonio único y comparar meses con distinta
composición de monedas. Effort **M**. Nueva tabla `exchange_rates`.

### 3.3 Conciliación de cuenta

Responder "¿cuánto tengo realmente?" comparando el saldo de un extracto nuevo
contra el saldo que dice la app, y mostrando la diferencia. Es el control que
falta: si algo está mal, hoy no hay forma de saberlo. Effort **M**.

### 3.4 Vista de “cómo calculé este número” — HECHO

Todo total que la app muestra es ahora un enlace a los movimientos que lo
componen: `/transacciones?category=X&month=Y&type=expense`.

Hizo falta añadir el filtro por mes a la tabla, que no existía. Sin él, un
total de categoría abría onto su historia completa y no cuadraba con nada.
Filtra con `transactionMonth`, el mismo bucketing con el que se calculó el
total, y solo acepta la forma exacta `YYYY-MM`: un valor mal formado degrada a
«todo» en vez de mostrar una lista vacía, que se leería como «no gastaste nada».

Enlazan: la columna **Gastado** del presupuesto, las barras de **Top
categorías**, y **las dos columnas** de la tarjeta de comparación —un delta
solo es creíble si se pueden ver los dos lados—. Verificado de punta a punta:
22 enlaces, y la lista que devuelve cada uno suma exactamente el número que
está al lado.

Effort **S**, hecho. Cierra el principio 3.
## Fase 4 — Arquitectura

Solo lo que la evidencia pide. Effort: **M**–**L**.

### 4.1 Agregación en SQL — HECHO

Todo lo que las páginas mostraban como tarjetas o gráficas se calculaba
en JavaScript sobre la lista completa de transacciones. Ahora cada pregunta es
un `GROUP BY` en `src/lib/aggregates.ts`.

Medido con `npm run bench` sobre el build de producción y 50 000 filas:

| Página | Antes | Después | |
|---|---|---|---|
| `/` | 408 ms | **118 ms** | 3,5× |
| `/cuentas` | 255 ms | **59 ms** | 4,3× |
| `/recurrentes` | 256 ms | **122 ms** | 2,1× |
| `/presupuesto` | 187 ms | **147 ms** | 1,3× |

Medianas de tres pasadas, con `npm run bench`. El `/` de la columna
"Después" además renderiza la tarjeta nueva de comparación mes a mes
(1.1), que antes no existía: hace más trabajo y sigue siendo 3,5× más rápido.

> La primera versión de estas cifras decía 6,0× y salía de un
> `bench:seed` con un fallo propio: escribía las fechas en milisegundos donde
> la columna espera segundos, así que todas caían en el año 56637 y
> `strftime` devolvía `NULL`. Con eso **todos** los agregados por mes devolvían
> vacío y las páginas "optimizadas" se veían rápidas por la razón
> equivocada. Se corrigió el generador y se midió de nuevo; estas son las
> cifras reales. Queda como lección: un número de rendimiento que sale de un
> fixture roto no es un número de rendimiento.

Lo que lo hace seguro: `balance.ts` y `spending-stats.ts` **no se borraron**.
Siguen siendo la implementación legible, y
`src/lib/__tests__/aggregates.test.ts`Comprueba que cada función SQL devuelve
exactamente lo que devuelve su gemela en JS, contra la base real. Un agregado
que discrepa en silencio es peor que una página lenta.

Esa comparación es la que encontró dos bugs reales:

1. **`netWorthTrend` inventaba historia.** Deshacía toda transacción posterior
   a un límite de mes, **sin comprobar la fecha de referencia** de la cuenta.
   Esos movimientos ya están dentro de `referenceBalanceMinor`, así que
   deshacerlos otra vez añadía dinero que el saldo nunca tuvo. En los datos
   reales eso ponía **EUR 589.776,40** de patrimonio a `acc_global66` durante
   siete meses — una cuenta cuyo saldo de referencia es 0 y que nunca tuvo un
   euro. Corregido en `balance.ts`, con dos tests que lo fijan.
2. **`detectRecurring` agrupaba meses en UTC.** Usaba `toISOString()` mientras
   todo lo demás usa `monthKey()` (hora local). Un cargo del 31 a las 8 de la
   noche contaba como mes siguiente.

Effort **L**, hecho. Ver `PLAN.md` §A.5.

### 4.2 Una sola definición de "mes" — PARCIAL

`monthKey()` (hora local) ya es la referencia y `src/lib/month-sql.ts` la
reproduce en SQL, así que las agregaciones y las páginas coinciden. Lo que queda
es que `detectRecurring` usaba UTC — corregido en 4.1 — y que el bucketing
esté repartido en tres archivos en vez de uno. Effort **S** restante.

### 4.3 Tests al resto de la lógica — HECHO (4 de 5)

Los cuatro primeros, que era lo que pedía el esfuerzo M:

| Módulo | Tests | Lo que fijan |
|---|---|---|
| `splits.ts` | 15 | El invariante: atribuir dinero **nunca lo crea ni lo destruye**, solo lo mueve entre categorías |
| `rules.ts` | 20 | Comparación numérica, precedencia, y que una regla vacía no se vuelva catch-all |
| `spending-stats.ts` | 18 | Monedas separadas, frontera de mes al último instante, splits que cuadran con el total |
| `month.ts` | ya existían | — |

Escribir estos tests encontró **un fallo real**: una condición de regla con
el valor vacío hacía match con **todo**, porque `"abc".includes("")` es `true`
en JavaScript. Una regla guardada con una caja a medio llenar habría archivado
el libro entero en una categoría. Corregido, con el motivo escrito en el
código. `equals ""` sigue permitido a propósito: «la descripción está vacía» es
una pregunta real, y es como se apunta a lo sin pagar.

Los tests también enseñaron el contrato: `RuleCondition` no tiene campo
`categoryId` y `RuleAction.value` nunca es `null`. Tres tests míos se
escribieron contra un contrato imaginario y los quité.

`statement-parser.ts` sigue **sin tests**: merece un PDF real como fixture y no
hay ninguno. Effort **M**, pendiente.
### 4.4 Constantes duplicadas — HECHO (TRANSACTION_TYPES)

`TRANSACTION_TYPES` existe **dos veces**: `lib/enums.ts:10` y
`lib/transactions-query.ts:20` (esta la añadí yo al hacer la paginación).
`TYPE_LABELS` en `transacciones-table.tsx:55` re-declara
`TRANSACTION_TYPE_LABELS` de `enums.ts:13`. Los labels de reglas están
duplicados idénticos en `reglas/page.tsx:13-31` y `rule-form-dialog.tsx:60-78`.

También: `unlinkCategoriesFromRules` y `unlinkPayeesFromRules` son el mismo
cuerpo con una constante distinta, y **ninguna se llama al borrar una cuenta**
(`cuentas/actions.ts:37`) — las reglas con `accountId` quedan colgando.

Effort **S**, y es la condición para que 4.3 sea mantenible.

### 4.5 Capa de servicio para las Server Actions

Hoy las actions mezclan validación, query y `revalidatePath`. La lógica de
negocio que vale la pena testear vive ahí y es difícil de alcanzar sin base de
datos. Extraer el grueso a funciones puras en `src/lib/` (como ya se hizo con
`transactions-query`) y dejar las actions como adaptadores finos. Effort **L**,
pero es lo que hace escalable el testing. Ver también 0.7j (validar en el
servidor), que es la mitad del problema y mucho más barata.

### 4.6 Streaming en las páginas lentas

Con agregación en SQL, las páginas deberían streamear: shell primero, datos
después. Hoy un error de DB muestra pantalla en blanco (ver 0.6). Effort **S**
una vez que 4.1 exista.

---

## Fase 5 — Rendimiento que ya está medido

No es lo más visible, pero está cuantificado en `PLAN.md`.

| Qué | Ahora | Objetivo |
|---|---|---|
| Markup por fila | 4,7 KB | < 1 KB |
| Shell por página | 77 KB | — |
| `/transacciones` a 50k | 310 KB, 111 ms | constante ✓ (ya cumplido) |
| `/recurrentes` a 50k | 621 KB, 485 ms | ver 4.1 |

**5.1 Clases de Tailwind repetidas** (~2 h). Cada `<td>` repite ~85 caracteres
de clase; un `<span>` de badge, ~640. El shell son 77 KB en cada página
aunque no haya datos. Extraer a `@apply` / componentes. Ganancia ~S**.

**5.2 `PAGE_SIZE` de 50 a 25** (1 línea, medible). Con 4,7 KB por fila, 25
filas son 118 KB en vez de 235 KB. Probar si 25 filas se sienten suficientes
—en celular, probablemente sí.

---

## Lo que NO construiría

Tan importante como la lista. Cada uno de estos suena bien y no vale el
esfuerzo para una app personal de una persona.

- **Cuentas de usuario / multiusuario.** Es single-user por diseño. Añadirlo es
  complexity sin destinatario (ya se decidió así en la auth).
- **App móvil nativa / PWA offline.** El acceso por navegador es suficiente.
  Offline con SQLite es un problema grande para un beneficio pequeño.
- **Sincronización en la nube.** Contradice el objetivo self-hosted.
- **Escaneo automático de recibos (OCR).** El parser de PDF ya es frágil y
  dependiente de un solo banco; OCR añade una dimensión de fragility.
- **Categorías personalizadas por usuario / compartir presets.** Es una persona.
- **Notificaciones push / emails.** No hay a quién notificar.
- **Un sistema de plugins.** Sobredimensionado.

---

## Orden recomendado

Cada fase deja la app usable por sí sola; ninguna bloquea a la siguiente.

| Orden | Qué | Effort | Por qué aquí |
|---|---|---|---|
| **0.7** | Bugs de dinero (a, c, d, e, k) | ~1 día | **El dinero se pierde o se miente.** No son mejoras, son errores |
| **0** | Fricción de uso (0.1–0.6, g, h, i) | ~1,5 días | Lo vi usar; lo más barato que más se nota |
| **1.0** | Vista "sin categoría" | ~1 día | Es la tarea que justifica abrir la app |
| **3.1** | Bug de zona horaria | ~1 h | Único punto que es un número **incorrecto** |
| **0.7j** | Validar en las Server Actions | ~1 día | El sitio donde la validación debe estar |
| **1.1** | Comparación mes contra mes | ~1 día | La capacidad ya existe, solo está escondida |
| **1.4 + 1.6** | Suscripciones y comercios | ~3 h | Los datos ya están calculados |
| **3.2 + 0.7b** | Conversión de moneda | ~1,5 días | Sin esto el presupuesto miente en silencio |
| **2.1** | Entrada rápida por texto | ~2 días | El que más uso generaría |
| **3.4** | Auditar un total | ~2 h | Cierra el principio 3, muy barato |
| **1.3 + 1.2** | Alertas y resumen del mes | ~2 días | Ya sale de los cálculos existentes |
| **4.4** | Constantes duplicadas | ~3 h | Habilita 4.3 sin dolor |
| **4.2 + 4.3** | Mes único + tests | ~1 día | Habilita 4.1 con confianza |
| **4.1** | Agregación en SQL | ~1 día | Solo después de que 4.2 fije el bucketing |
| **2.2 + 2.3** | Recurrentes y splits rápidos | ~2 días | Ya existen las bases |
| **5.1** | Markup Tailwind | ~2 h | Cuando el resto esté estable |
| **3.3** | Conciliación | ~1 día | Requiere 3.2 para ser útil |

**Lo primero, sin duda: §0.7 (los bugs de dinero).** No son mejoras de producto,
son errores verificados: el bulk edit puede borrar saldo del patrimonio, el
presupuesto ignora en silencio todo lo que no esté en pesos, los splits no se
limpian al recategorizar en masa, y la precedencia de las 44 reglas depende del
orden de filas de SQLite. Cada uno es de Effort **S** y ninguno requiere
decisión de producto — solo están ahí.

Después, las dos columnas vertebrae del uso diario: **quitar la fricción que ya
medí usando la app** (§0), y **la vista de "sin categoría"** (§1.0), que es la
tarea por la que realmente se abre la app y hoy no existe.

---

## Decisiones que faltan tomar

Cosas donde la respuesta cambia qué se construye:

1. **¿Cuánto móvil vs escritorio?** Cambia el orden de 0.1, 5.2 y si hace
   falta 2.1. Hoy asumí "a veces desde el celular".
2. **¿Las suscripciones se gestionan aquí o solo se registran?** Si se gestionan,
   2.2 sube de prioridad. Si solo se registran, es un informe y 1.4 basta.
3. **¿Se va a importar de otros bancos?** Si sí, 3.3 y el importador genérico
   entran antes. Hoy el parser solo entiende Bancolombia.
4. **¿Presupuesto por sobres o por proyecto?** Ahora conviven y la Página de
   presupuesto no contempla proyectos. Si los proyectos se usan, se nota.
