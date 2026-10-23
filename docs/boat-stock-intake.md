# Cargas de stock y gastos de A bordo

Desde Mi día → Fotos y listas, o Stock y pedidos → Cargar foto o lista:

1. Elegir conteo, compra recibida, gasto sin stock o lista de faltantes.
2. Adjuntar hasta tres fotos JPG/PNG/WebP, una lista TXT/CSV o pegar texto/celdas.
3. Revisar los datos detectados. Completar fecha, cantidad, unidad, área y ubicación reales. Un dato ilegible permanece pendiente; no se deduce el contenido de cajas ni cantidades ocultas en estantes.
4. Enviar la preparación. Administración/encargado confirma conteos y gastos. El autor puede convertir su lista de faltantes en borradores de Pedidos y luego solicitarlos.

Un conteo reemplaza solamente las cantidades de los productos incluidos. Una compra recibida suma stock y gasto en una transacción. Si la recepción ya se registró desde Pedidos, usar gasto sin entrada de stock. Registrar consumo una sola vez, desde Stock o como material utilizado en un trabajo.

Control de gastos y pagos muestra totales separados por moneda y permite descargar gastos y pagos en CSV. El valor estimado de existencias usa precios unitarios confirmados en la moneda del barco. No convierte monedas ni concilia automáticamente el CRM.

## Control del gasto y de los pagos

La tripulación adjunta comprobantes desde Fotos y listas. Las cargas pendientes de revisión se muestran como aviso y todavía no integran los totales. Cuando administración confirma un gasto, aparece inicialmente **sin revisar su situación de pago**; eso no significa que esté impago.

En Mi día → Gastos → Ver gasto y pagos, administración/encargado:

1. Registra los pagos ya realizados: importe en la moneda del comprobante, fecha real, quién pagó/cuenta de origen, medio, referencia y foto opcional. Admite pagos parciales. No ejecuta pagos ni transferencias.
2. Revisa el gasto y los pagos anteriores; completa categoría, vencimiento real si existe y notas. Al confirmar la revisión, el saldo pasa a pendiente confirmado, parcial o pagado. No se inventan fechas de vencimiento.
3. Si hay un error, anula el **registro** de pago indicando motivo. Se conserva el historial y se reabre la revisión. La anulación no devuelve dinero.

El resumen filtra por fecha del gasto, proveedor/comprobante, categoría y estado. Los pagos del resumen son los vinculados a esos gastos, aunque se hayan realizado en otra fecha. El CSV de pagos conserva las fechas reales de pago y los registros anulados identificados. No es un estado de cuenta bancario. Los vencidos requieren vencimiento definido, saldo positivo y revisión confirmada.

Se bloquean pagos mayores al saldo, monedas incompatibles, reenvíos duplicados y modificaciones simultáneas con datos desactualizados. Un cambio posterior en los datos del gasto exige revisar nuevamente la situación de pago. Los respaldos incluyen controles, pagos e historial, y rechazan restauraciones que los perderían.

## Lectura y configuración

La extracción avanzada usa `ANTHROPIC_API_KEY` exclusivamente en el servidor y `BOAT_INTAKE_MODEL` opcional. Si falla, se usa OCR local Tesseract en español/inglés y lectura conservadora de listas. El primer uso descarga el lector; requiere conexión. Las fotos borrosas, letra difícil y comprobantes complejos pueden requerir corrección manual. Nunca publicar claves ni credenciales de tripulación.

Formato de lista: `Producto; cantidad; unidad; ubicación; precio unitario opcional`. También admite tabulaciones, CSV con comillas, y líneas como `cantidad unidad de producto`. Los campos de comprobante pueden escribirse como `Fecha: AAAA-MM-DD`, `Proveedor:`, `Moneda:` y `Total:`. Revisar siempre contra la fuente.

## Integridad

- Sesiones reales y pertenencia al barco verificadas en la base de datos.
- Conteos y gastos requieren administración/encargado; solicitudes propias conservan permisos de tripulación.
- Fotografías conservadas con acceso autenticado. Identidad del archivo y del comprobante evitan repetir gastos; la revisión humana sigue siendo necesaria si el documento no tiene número y se vuelve a fotografiar.
- Bloqueo del barco, revisión y claves de operación evitan actualizaciones perdidas y reenvíos duplicados.
- Respaldos incluyen el registro de cargas. Una restauración que perdería cargas posteriores se rechaza para recuperación coordinada.

## Verificación del 23/10/2026

Pruebas con barco QA aislado: sesiones de los tres roles; lectura de texto; foto con dos productos leídos por OCR; revisión de chef y confirmación de administrador; conteo absoluto; compra y gasto atómicos; gasto sin stock; monedas separadas; duplicados; conflicto de revisión; rechazo de filas incompletas sin cambios parciales; respaldo y rechazo de restauración incompatible. Vista móvil de 390 px sin desbordamiento. Nomade conserva stock sin cargar hasta recibir un conteo real.

La clave del proveedor disponible durante estas pruebas devolvió HTTP 401: extracción avanzada pendiente de reemplazar y verificar la clave. OCR local y listas comprobados.
