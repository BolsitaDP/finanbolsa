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

**(g) Enums en inglés en la UI en español.** Effort **S**. — **HECHO**
`{row.original.status}`, `{row.original.kind}`, `{tx.type}` y
`a.type.replace("_"," ")` se renderizan crudos, y los pickers de bulk edit
mostraban `"credit card"`, `"active"`, `"expense"`. `lib/enums.ts` ya tenía
`ACCOUNT_STATUSES` y `TRANSACTION_TYPE_LABELS`; solo faltaba usarlos.

El arreglo fue **una función, no doce ediciones**. El patrón
`Object.fromEntries(TYPES.map(t => [t, LABELS[t]]))` estaba escrito nueve veces,
y cuatro de las nueve se habían desincronizado: dos usaban
`t.replace("_", " ")` y tres usaban el valor crudo. Duplicar el patrón era
justo lo que dejaba que se desincronizaran, así que ahora es `labelItems()` en
`lib/enums.ts` y no hay forma de traducir un picker y olvidar el siguiente.

También: la columna **Estado** de `/categorias` no tenía `cell`, así que TanStack
pintaba el valor crudo de la base — "active" al lado de "Activa" en la tabla de
cuentas.

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
### 1.3 Alerta de gasto fuera de lo normal — HECHO

*"Este mes gastaste 3,2x tu promedio en la categoría Compras"*. Detecta el valor
atípico comparando contra el promedio de los últimos 6 meses de esa categoría.
Es el tipo de cosa que detecta una fuga pequeña antes de que sea grande.

La comparación mes-contra-mes que ya existía no servía: comparar contra **un**
mes no es una base, porque una categoría normal se ve rara cualquier mes que le
toque.

**Lo que hace que la tarjeta sea útil es que se calle.** Tres reglas, y las tres
son la diferencia entre una alerta y ruido:

1. **La base se proratea con la parte del mes que ya pasó.** Sin esto la alerta
   llega tarde o nunca: comparar el mes en curso contra meses completos
   subestima el mes a la mitad, y una categoría que va a terminar en 1.300.000
   cruzaría el umbral recién el día 30, cuando no hay nada que hacer con el dato.
   Prorateando, la fuga se ve el día 15. El supuesto —que el gasto se reparte
   parejo en el mes— es falso para un arriendo que cae el día 1, y está escrito
   en el código en vez de escondido.
2. **La base tiene que ser estable.** "Reparaciones" (0, 500.000, 0) tiene un
   promedio bajo y cualquier mes normal parecería una anomalía. Con un tope de
   variación del 60% sobre los meses con gasto, esas categorías no generan
   alertas, que es lo correcto: un pico ahí es lo esperado. Es el mismo
   razonamiento que el coeficiente de variación de `detectRecurring`, que separa
   una suscripción de una parada frecuente.
3. **Tres meses mínimo, y el umbral es 3x estricto.** Un mes de base no es un
   promedio. Y 3,00x es indistinguible de 2,99x, así que la comparación es `>` y
   no `>=`: una tarjeta que se enciende en la frontera se enciende siempre.

**Ordena por el exceso, no por el ratio.** 3,2x sobre una base de 400.000 son
880.000 de sobra; 8x sobre una base de 20.000 son 140.000. El ratio pone al
segundo primero y esconde la fuga grande, que es la que importa.

Effort **M**, hecho. `detectSpendOutliers` es pura, con 22 tests — la mayoría de
ellos sobre los casos en que **no** avisa, que es donde está el riesgo.

### 1.4 Alerta de suscripción que sube de precio — HECHO

`recurring.ts` ya agrupaba suscripciones y calculaba el promedio. Falta comparar
el **último monto contra lo que costaba antes** y avisar: *"Netflix subió de
$35.000 a $42.000"*. Es el número que más duele y el más fácil de no ver: es el
único de la app que puede moverse **sin que nada en la base de datos cambie de
aspecto** — el movimiento sigue pareciendo un movimiento más, y el promedio
mensual se lo come.

**La comparación es contra los cargos anteriores, no contra el promedio del
grupo.** El promedio del grupo incluye el cargo nuevo, así que una subida del
20% sobre cuatro meses se diluye a ~5% y desaparece. Con tres cargos de
35/35/42, el promedio es 37.3k y comparar contra él daría un "aumento del 12%"
sobre una base que ya contiene la subida.

**Dos umbrales, y gana el mayor.** El ratio (10%) es lo que el usuario lee, pero
por sí solo trata un plan de 3.000 → 3.300 igual de fuerte que uno de
35.000 → 42.000. El segundo umbral es la **desviación de los cargos anteriores**:
una suscripción que ya se mueve cada mes no avisa por moverse dentro de ese
movimiento. Al salir de los datos, no necesita un mínimo en pesos, y por eso la
misma regla sirve para un plan en dólares facturado en pesos.

Tres decisiones que **no** se tomaron, y por qué:

- **Es unidireccional.** Bajar no avisa. Un plan más barato es buena noticia y la
  tarjeta no tiene espacio para decirlo sin insinuar que algo va mal.
- **No reavisa de una subida antigua.** Se compara el último cargo contra todos
  los anteriores, así que una suscripción que subió tres veces y lleva un año
  estable no muestra alerta. Es la lectura honesta: no cambió últimamente.
- **No se promulgó ningún error nuevo.** Subió, lo que es una señal de que hay
  algo que revisar, no una afirmación de que esté mal. Por eso vive en
  `/recurrentes`, que es un informe, y no en el dashboard.

**El punto ciego, fijado con un test:** una subida lo bastante brusca para romper
el coeficiente de variación (35k → 90k da ~0.49, sobre el techo de 0.35) hace
que el grupo **deje de reconocerse como suscripción**, así que no hay nada que
comparar. El detector asume estabilidad y por eso no puede detectar que dejó de
ser estable. Cerrarlo pide una tendencia por grupo en vez de una prueba de
estabilidad, que es parte de §2.2.

Effort **M**, hecho. `detectPriceIncrease` es pura y tiene 8 tests; el resto
cubre que el comparativo sea el correcto y que no reavise.

### 1.5 Lo que viene este mes — HECHO

Usando los recurrentes detectados, proyectar el gasto de los próximos 30 días y
mostrar "gastos previstos ≈ $340.000". Convierte `/recurrentes` de un listado
en un pronóstico. Effort **M**.

Tres cosas que el `GROUP BY` no daba y que sí importaban:

- **Proyecta el último cargo, no el promedio.** Una suscripción que subió de
  35.000 a 42.000 tiene un promedio de "unos 39.000", y 39.000 no es lo que van
  a cobrar. Para lo que ya pasó el promedio sirve; para lo que viene, no.
- **La fecha sale de `lastDate + intervalo mediano`, no de "dentro de 30 días,
  cobra".** Conserva la fase: una que cobra el día 5 y otra el día 28 no son lo
  mismo aunque ambas caigan este mes. Y el intervalo se **mide** sobre los cargos
  reales, porque la detección no sabe que todo lo que encuentra es mensual.
- **Lo cancelado no se proyecta.** Un recurrente que no aparece hace más de 45
  días sale del cálculo. Aquí el informe y la previsión discrepan a propósito: la
  lista incluye lo que se canceló, el dinero que va a salir no.

**Un límite del detector que salió al construir esto:** `MIN_MONTHS` cuenta
meses *calendario* distintos, así que una suscripción semanal es invisible para
`detectRecurring` — tres cargos en un mes no cuentan. Todo lo que llega a la
proyección es de 10 días o más. No es un bug de la proyección, pero está fijado
con un test en vez de discoverlo en seis meses.

Effort **M**, hecho. 14 tests.

### 1.6 Ranking de comercios — HECHO

*"Tus 5 comercios principales este mes"*, con total y variación contra el mes
anterior. Effort **S**, era un `GROUP BY payee`.

La pregunta es distinta de la del ranking por categoría y la respuesta también:
un gasto puede estar en "restaurantes" seis meses y ser siempre el mismo
restaurante, y saberlo es lo que permite **decidir** algo — cancelar, cambiar de
plan — en vez de solo notar que el número creció.

Tres cosas que el `GROUP BY` no daba y que sí importaban:

- **Ordena por el delta, no por el total.** "Supermercado" puede ser lo más
  grande del mes y "Rappi" lo que más subió. La tarjeta responde "¿qué cambió?",
  que es lo que la tarjeta de al lado responde; dos rankings distintos por el
  mismo conjunto de filas serían dos preguntas con la misma respuesta.
- **Los comercios sin payee se excluyen, no se agrupan.** Un cubo "sin comercio"
  sería todos los retiros y cargos de tarjeta que nunca tuvieron nombre, ordenado
  contra tiendas de verdad: un número sin sentido que además quedaría arriba.
- **No es split-aware, a diferencia del agregado por categoría.** Un split
  reatribuye un retiro a otras *categorías*; no cambia a quién se le pagó. Sumar
  las partes de un split para inflar el total de un comercio contaría ese
  retiro dos veces.

**La comparación se extrajo, no se copió.** `buildCategoryDeltas` y
`buildPayeeDeltas` hacen lo mismo con otra clave, así que la lógica — qué entra
cuando algo desaparece, y que dos monedas nunca se sumen — vive una vez en
`src/lib/deltas.ts`. Los 7 tests de la tarjeta de categorías siguen pasando sin
tocarse, que es lo que prueba que la extracción no cambió nada.

**El total enlaza a los movimientos, con un filtro de verdad.** `auditLink` no
tenía forma de filtrar por comercio, y buscar el nombre del comercio con `q`
devolvería además toda fila cuya descripción lo contenga: un conjunto más grande
que no suma lo de al lado. Se añadió `payee` a los filtros de la tabla.

Escribir ese filtro destapó un hueco real: `?payee=` a medio escribir llegaba al
`WHERE` como `payee = ''` y **no devolvía ninguna fila** — una lista vacía en vez
de la lista sin filtrar. El mismo hueco estaba en `?account=`. Los dos ahora
degradan a "todo", con test.

Effort **M**, hecho. 6 tests para el envoltura; la lógica compartida ya estaba
cubierta.

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

### 2.4 Sugerencias de categoría mientras escribes — HECHO

Hoy el motor de reglas existe (`applyRulesToTransactions`) pero se ejecuta en
lote desde una tabla, no **mientras se digita**. Aplicar la regla en el
momento del guardado evita tener que corregir después — que es el principio 4.

**Sugerida, nunca aplicada. Y esa decisión resultó forzosa, no una
preferencia.** El primer intento aplicaba las reglas en el servidor dentro de
`createTransaction`, como red de seguridad para cualquier vía de entrada. Se
quitó al ver lo que el formulario envía: `null` significa **dos cosas** —"no
elegí categoría" y "elegí Sin categoría"— y no son la misma petición.

Dejar un movimiento sin categoría a propósito es exactamente cómo llega al
trabajo semanal que `/transacciones?category=none` existe para limpiar
(§1.0). Un llenado automático en el servidor tiene que adivinar entre las dos, y
adivinar mal categoriza el trabajo que el usuario iba a hacer él mismo. En el
formulario esa distinción todavía es observable —el campo está intacto—, así que
ahí sí se puede preguntar.

El chip ofrece un clic. Si no se acepta, el movimiento se guarda tal cual: la
ausencia de una regla no es razón para inventar un valor.

**El motor se evalúa en un solo sitio.** `resolveRuleFields` en `rules.ts` lo
resuelve ahora, y lo usan tanto la sugerencia como el "aplicar a todo" de la
página de reglas. Un motor con dos implementaciones es uno cuya sugerencia está
mal la mitad de las veces, sin forma de saber de cuál salió la fila que se
guardó. La precedencia (gana la regla de mayor `sortOrder`) es la misma que
tenía el lote, y por lo mismo la página de reglas muestra ese orden.

Effort **M** (era S si se hubiera hecho a lo bruto), hecho. 13 tests, casi todos
sobre lo que **no** debe pasar: que una regla sustituya una categoría elegida a
mano, y que una acción apuntando a una categoría borrada se escriba.

### 2.5 Advertencia de duplicado — HECHO

El importador ya detecta duplicados por firma. Falta la **captura manual**: si
el mismo payee + monto + fecha ya existe, avisar antes de crear. Effort **S**.

**Avisa, no bloquea.** Dos compras idénticas el mismo día son dos compras, y solo
quien está escribiendo puede saber cuál de las dos cosas es. Un formulario que
se negara a guardar obligaría al usuario a buscar cómo saltarse la validación.
El aviso aparece mientras se escribe (500 ms de debounce) y también al **editar**
—corregir el monto de un movimiento para que cuadre con el estado de cuenta es
justo cuando se copia uno que ya existe—.

**La firma es distinta a la del importador, y por qué.** El importador compara
`fecha|monto|descripción` porque la descripción es la que puso el banco. En
entrada manual es texto libre, y dos copias del mismo movimiento rara vez
coinciden palabra por palabra. Así que el comercio decide la **confianza** en
lugar de la identidad, y hay dos niveles:

- **`exacta`** — mismo comercio, o misma descripción normalizada. Casi con
  seguridad la misma compra escrita dos veces. El aviso puede decir "ya existe".
- **`probable`** — mismo monto el mismo día, sin nada que confirmar. El texto
  tiene que decirlo de otra forma ("puede que sean compras distintas"), porque
  dos cafés el mismo día son dos cafés.

Las dos frases del aviso son deliberadamente distintas. Un texto que dice "esto
ya está" sobre una coincidencia probable entrena al usuario a ignorar el aviso
justo cuando sirve.

**La fecha se compara en hora local**, con un test que fija los dos lados de la
frontera de medianoche: un movimiento escrito a las 8 p. m. del 31 en Colombia
es el 31 local, y `toISOString()` lo daría como 1 de septiembre — el mismo error
de §3.1 aplicado a un aviso en vez de a un CSV. Y el monto se compara en valor
absoluto, porque las transferencias se guardan con signo negativo y un gasto con
signo positivo: el mismo movimiento en las dos mitades de la app no puede
aparecer como duplicado de sí mismo.

Effort **M**, hecho. 17 tests, casi todos sobre el falso positivo, que es el
riesgo real de un aviso.

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

### 3.3 Conciliación de cuenta — PARCIAL, y no por donde se pensaba

Responder "¿cuánto tengo realmente?" comparando el saldo de un extracto nuevo
contra el saldo que dice la app, y mostrando la diferencia. Es el control que
falta: si algo está mal, hoy no hay forma de saberlo. Effort **M**.

**Lo hecho es la otra mitad del problema, y resultó ser la urgente.** Antes de
extraer saldos de los PDF se revisó cómo se calculan los saldos que ya se
mostraban, y aparecieron **dos formas en que la app se inventa o pierde dinero
sin dar un solo error**. No son fricción: son números que mienten, que es la
categoría que §0.7 pone primero.

**(a) Los splits podían atribuir más plata de la que salía.** El invariante de
`splits.ts` —atribuir dinero nunca lo crea ni lo destruye, solo lo mueve— estaba
escrito en los tests pero **nada lo exigía en la frontera**. Cada split solo se
validaba como "número no negativo", así que un retiro de 100.000 se podía
desglosar en 150.000 de mercado más 80.000 de carnes. Los dos splits se contaban
completos y el remanente negativo se descartaba en silencio (`if (remainder > 0)`),
de modo que **categorías, presupuesto y estadísticas terminaban con 230.000 de
gasto de un movimiento de 100.000**. Plata inventada.

Ahora `findOversplit` lo rechaza en `createTransaction` y en `updateTransaction`,
con el exceso en el mensaje. Se **rechaza en vez de recortar**: recortar escribiría
un desglose distinto del que el usuario compuso, y el formulario mostraría
números que ya no cuadran con el diálogo. Un peso de más ya es un peso de más: no
hay tolerancia.

Editar es donde más fácil se dispara, y por eso también está ahí: bajar el monto
de un movimiento sin tocar los splits que ya había.

**(b) Los movimientos anteriores al saldo de referencia se contaban en todo
excepto en el saldo.** `currentBalances` (y su gemelo SQL) sólo suma lo posterior
a `referenceDate` — para eso existe la fecha de referencia, el saldo de partida
ya lo incluye. Pero **todas** las estadísticas de gasto sí lo cuentan. El
resultado es una app que dice "$412.000 gastados en agosto" con un saldo que no
refleja ni uno de esos pesos.

Pasa al importar un extracto de un periodo anterior, o al mover la fecha de
referencia de una cuenta a una más reciente. Ninguna de las dos es un error de la
app: es el usuario cambiando de opinión sobre dónde empieza su historial. Lo
que faltaba era **decírselo**.

La comparación es `date <= referenceDate`, no `<`: la del saldo es estrictamente
mayor, así que un movimiento **del mismo día** tampoco suma. Es el mismo detalle
del CSV (§3.1) y por la misma razón importa.

**Lo que se hizo con eso: una tarjeta de integridad en el dashboard** que solo
aparece cuando hay algo que reportar, y que enlaza a los movimientos y a la
cuenta afectada. Es un control, no un arreglo: señala dónde mirar y dice cuál es
la forma de arreglarlo. Una tarjeta permanente de salud en el inicio sería ruido,
y el día que importa tiene que ser la primera que se ve.

El criterio de las dos funciones puras (`ledger-integrity.ts`) es **cuándo no
reportar**: un aviso que señala una cuenta sana hace que se apague el aviso, que
es justo lo contrario de lo que se busca. 21 tests, casi todos sobre el falso
positivo, más una verificación de punta a punta contra la base real.

**Lo que sigue pendiente de esta sección:** comparar el saldo contra el que trae
el PDF. El parser de Bancolombia **ya captura la columna de saldo y la tira** —el
regex la exige para que la fila calce y nunca la guarda—, así que el groundwork
está a medio hacer. No se hizo a ciegas porque un saldo mal extraído produce un
"tu saldo está descuadrado en X" que en realidad es un bug del parser, y un aviso
que miente entrena a ignorar el aviso. `statement-parser.ts` sigue sin un solo
test porque no hay un PDF real como fixture (§4.3); hace falta eso antes.

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
