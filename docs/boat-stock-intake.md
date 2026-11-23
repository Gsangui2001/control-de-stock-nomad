# Cargas de stock y gastos de A bordo

## Registrar lo que se ve en el barco

En **Administrar → Barco y respaldo**, administración puede abrir **Importar fichas de equipos** y elegir el archivo JSON del relevamiento. La vista previa muestra cada identificación, su ubicación y la foto disponible. Seleccioná las fichas que reconocés en la embarcación indicada y confirmá. Se incorporan a **Equipos y horas de uso**. Para completar modelo, ubicación, notas u horas, abrí **Actualizar** en el equipo.

Una lectura de cero se registra cuando el contador marca cero. Para un equipo sin contador visible, dejá las horas pendientes. Las fichas documentan equipos instalados y puntos de inspección. El alta conserva las existencias y los movimientos de mercadería. Si volvés a abrir el mismo archivo, se omiten las fichas ya incorporadas.

Para incorporar repuestos, bebidas y demás insumos, contá lo disponible por ubicación. En **Tickets y listas**, elegí **Conteo** y revisá fecha, producto, cantidad, unidad, área y ubicación antes de confirmar. Una compra recibida se registra como compra; un repuesto usado se registra como consumo o como material de un trabajo.

## Tickets y stock compartido — cambio preparado el 26/10/2026

Stock y pedidos incluye **Cargar ticket y sumar stock**. La lectura prepara los productos; el usuario revisa cantidad, unidad, área y ubicación y confirma que la compra fue recibida. Bebidas y mercadería usan el área gastronómica; materiales, repuestos y limpieza usan el área técnica. Un mismo ticket puede contener ambas áreas.

Solo el administrador puede cargar tickets, listas, conteos y recepciones de compras. Puede **Confirmar ticket y sumar al stock** en un solo paso: el comprobante, el gasto, las existencias y los movimientos se guardan en una transacción. Si una fila es inválida o el inventario cambió desde la revisión, no se aplica parte del ticket. Los capitanes y demás tripulantes no pueden cargar tickets ni existencias, tampoco mediante los endpoints anteriores. Un gasto de servicios o una compra recibida previamente sigue cargándose sin una nueva entrada de stock.

Los reintentos conservan la operación original; si se pierde la respuesta, **Verificar guardado pendiente** consulta/reintenta el mismo guardado sin volver a sumar. Se mantiene también la deduplicación por documento y proveedor/número/fecha. El consumo se descuenta desde cada producto, con motivo y responsable, y bloquea cantidades mayores al disponible.

**Stock de otros barcos** está reservado a capitanes y administrador. Chef, marinero, lector y encargado no acceden a esa consulta. Incluye filtros por barco y área y búsqueda por producto, ubicación, referencia y especificaciones. Comparte cantidades y ubicación; no comparte facturas, precios, cámaras ni pasajeros. Esta consulta no concede permisos para modificar o retirar stock de otro barco. El inventario propio y sus consumos mantienen el flujo de trabajo de la tripulación.

El administrador conserva la asignación de tareas por rol, los filtros de pendientes/vencidas y el historial de trabajos con responsable y fotos. Las pruebas de tareas verifican que un tripulante no puede reasignar, eliminar o completar tareas de otro rol. La matriz de inventario se comprueba en `tests/boat-inventory-access.cjs` y en SQL, incluyendo los endpoints anteriores y la limpieza del stock compartido en caché al perder el permiso.

Estado de entrega: cambio local, pendiente de publicación. Migración nueva `20261026161306_boat_inventory_tickets_fleet.sql`, validada junto con `tests/boat-inventory-tickets-fleet.sql` dentro de una transacción revertida; no está aplicada permanentemente. Nomade tiene cero productos registrados al verificar el 26/10/2026. El conector de Vercel rechazó la inspección del proyecto con HTTP 403 por falta de acceso al equipo.

Validación: TypeScript, build, pruebas de lectura de listas, roles y alertas correctos; SQL verificó compra atómica, duplicados, consumo idempotente, exceso de consumo, consulta entre barcos, campos compartidos y permisos. La revisión móvil usa el frontend real con respuestas HTTP simuladas; no constituye una prueba de extracción de tickets reales ni un E2E de producción.

En el navegador a 390 × 844 se verificaron filtros de flota, búsqueda por referencia, conservación de filtros al actualizar, ausencia de desbordamiento y recuperación de un ticket tras perder su respuesta y recargar la página: 24 + 12 = 36, con borrador eliminado al confirmar el resultado. Capturas de datos simulados: `output/playwright/inventory-fleet-mobile.png` y `output/playwright/inventory-ticket-recovered-mobile.png`.

Como administrador, desde Mi día → Tickets y listas, o Stock y pedidos → Cargar ticket y sumar stock:

1. Elegir conteo, compra recibida, gasto sin stock o lista de faltantes.
2. Adjuntar hasta tres fotos JPG/PNG/WebP, una lista TXT/CSV o pegar texto/celdas.
3. Revisar los datos detectados. Completar fecha, cantidad, unidad, área y ubicación reales. Un dato ilegible permanece pendiente; no se deduce el contenido de cajas ni cantidades ocultas en estantes.
4. Confirmar el ticket para sumar existencias y gasto; los conteos y otras listas se guardan para su revisión y confirmación por el administrador.

Un conteo reemplaza solamente las cantidades de los productos incluidos. Una compra recibida suma stock y gasto en una transacción. Si la recepción ya se registró desde Pedidos, usar gasto sin entrada de stock. Registrar consumo una sola vez, desde Stock o como material utilizado en un trabajo.

Control de gastos y pagos muestra totales separados por moneda y permite descargar gastos y pagos en CSV. El valor estimado de existencias usa precios unitarios confirmados en la moneda del barco. No convierte monedas ni concilia automáticamente el CRM.

## Control del gasto y de los pagos

El administrador adjunta comprobantes desde Tickets y listas. Las cargas pendientes de revisión se muestran como aviso y todavía no integran los totales. Cuando administración confirma un gasto, aparece inicialmente **sin revisar su situación de pago**; eso no significa que esté impago.

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
- Conteos, tickets y recepciones de compras requieren administrador. La tripulación puede solicitar faltantes en Pedidos y registrar sus consumos.
- Fotografías conservadas con acceso autenticado. Identidad del archivo y del comprobante evitan repetir gastos; la revisión humana sigue siendo necesaria si el documento no tiene número y se vuelve a fotografiar.
- Bloqueo del barco, revisión y claves de operación evitan actualizaciones perdidas y reenvíos duplicados.
- Respaldos incluyen el registro de cargas. Una restauración que perdería cargas posteriores se rechaza para recuperación coordinada.

## Verificación del 23/10/2026

Pruebas con barco QA aislado: sesiones de los tres roles; lectura de texto; foto con dos productos leídos por OCR; revisión de chef y confirmación de administrador; conteo absoluto; compra y gasto atómicos; gasto sin stock; monedas separadas; duplicados; conflicto de revisión; rechazo de filas incompletas sin cambios parciales; respaldo y rechazo de restauración incompatible. Vista móvil de 390 px sin desbordamiento. Nomade conserva stock sin cargar hasta recibir un conteo real.

La clave del proveedor disponible durante estas pruebas devolvió HTTP 401: extracción avanzada pendiente de reemplazar y verificar la clave. OCR local y listas comprobados.
