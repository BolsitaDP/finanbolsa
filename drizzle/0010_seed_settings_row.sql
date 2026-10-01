-- La fila única de `settings` ahora se crea con el esquema, no con la primera
-- escritura de la aplicación.
--
-- El problema: la migración 0000 creaba la tabla pero no la fila, y la fila la
-- insertaba `db:seed` leyendo la hoja de cálculo original. Un despliegue nuevo —
-- o cualquier instalación que nunca corrió el seed— quedaba con la tabla vacía, y
-- guardar en Configuración hacía `update settings ... where id = 'default'` sobre
-- cero filas: **cero cambios, ningún error, y un toast de éxito**. El usuario
-- veía que su moneda base se había guardado y no se había guardado nada. Un
-- ajuste de moneda base en silencio es un presupuesto en silencio.
--
-- `or ignore` porque una instalación que sí corrió el seed —o que ya ajustó sus
-- ajustes— ya tiene la fila, y sobreescribirla con los valores por defecto sería
-- peor que el bug. Esta migración solo rellena el hueco.
--
-- `start_date` es la fecha UNIX de 2024-01-01, la misma que usa la instalación
-- original. Es un valor de arranque sin ninguna consecuencia hasta que el usuario
-- lo cambie desde Configuración.
insert or ignore into `settings` (`id`, `schema_version`, `base_currency`, `start_date`)
values ('default', '1.0', 'COP', 1704085200);
