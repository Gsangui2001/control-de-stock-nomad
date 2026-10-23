# Avisos de stock

Los avisos se generan al confirmar cambios en el inventario: conteo, compra recibida, consumo, materiales de un trabajo, transferencias y restauración confirmada. Un insumo genera `stock_minimo` al llegar a su mínimo positivo y `stock_agotado` al llegar a cero. Sin mínimo definido se avisa únicamente al agotarse. Un inventario sin cargar no significa que no haya existencias.

El trigger compara el estado anterior y el nuevo dentro de la misma transacción. No repite el aviso mientras permanece en el mismo nivel; una reposición parcial no genera otro aviso de mínimo. Después de reponer por encima del mínimo puede volver a avisar al cruzarlo. Modificar el mínimo puede activar un aviso si la cantidad actual queda por debajo.

Administración, encargado, capitán, chef y marinero reciben avisos dentro de la app. Los lectores no reciben estas notificaciones. El historial conserva cantidades del momento del aviso y muestra la situación actual. La pantalla Mi día muestra los faltantes actuales. Pedir reposición prepara el formulario; no aprueba ni compra automáticamente.

Administración define mínimos en Administrar → Inventario → Editar. Cada tripulante activa su teléfono en Mi día → Notificaciones → Activar en este teléfono. En iPhone debe abrir la app instalada en la pantalla de inicio. La activación y la recepción real deben comprobarse en cada dispositivo con Enviar prueba. Los consumos físicos no registrados no pueden detectarse.

Los avisos push usan la cola durable existente y el cron de cinco minutos, además del intento inmediato tras una escritura. Antes de reclamar trabajos pendientes se descartan faltantes ya repuestos y avisos reemplazados por uno posterior. El nombre, cantidad, unidad y mínimo se muestran en el mensaje; el enlace abre las notificaciones del barco. La marca por producto evita acumular varios avisos visibles del mismo insumo en el teléfono.

## Verificación del 23 de octubre de 2026

- Migración: `20261023203547_boat_stock_alerts.sql`.
- Código publicado: `76a2cd3`, deployment `dpl_HNA4nXuxR2N6t5dvshxMFSCKmw9x`.
- `node tests/boat-stock-alerts.cjs`: conteos desconocidos, mínimo sin definir, umbral exacto, cero y texto con cantidades.
- `tests/boat-stock-alerts.sql`, una transacción con rollback: cambios de nivel, deduplicación, reposiciones parciales/completas, conteo inicial cero, tres roles, lector excluido, cola durable y detalle del producto.
- Regresiones: roles, rutinas, lectura de listas y gastos; TypeScript y build de Vercel correctos.
- API autenticada con fixture temporal: consumo por los tres roles, reintento idempotente, conteo desde Fotos y listas, permisos de confirmación y lectura independiente de cada aviso.
- Navegador móvil, 390 × 844, cuatro roles: faltante en Mi día, detalle en Notificaciones, activación disponible y solicitud prellenada. Nomade real conserva Conteo inicial pendiente sin inventar faltantes.
- Producción: assets públicos idénticos al checkout y reintento autenticado de confirmación de conteo, incluida la llamada al despachador push, sin duplicar existencias.

No se ha comprobado recepción física de push: no había teléfonos suscritos. Nomade todavía requiere el conteo real y los mínimos acordados. Las pruebas usan un barco temporal que se retira al terminar.
