# Verificación de A bordo — 23/10/2026

Publicado en https://control-de-stock-nomad.vercel.app/a-bordo/index.html

Despliegue promovido: `dpl_7iaBXe3fneFTEpnxjHEuA2PQLjJa` (`control-de-stock-nomad-c381f9fcg-reviw.vercel.app`). Código de implementación conservado en el commit `53fb417`. Se compararon los ocho archivos estáticos operativos publicados con el checkout, normalizando únicamente finales de línea; todos coinciden. La publicación se realizó desde el checkout y no se deduce de la etiqueta Git del proveedor.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Compilación optimizada y tipos | Vercel READY |
| Roles, manual, tareas y protección de históricos | PASS |
| API con administrador, capitán, chef y lector | PASS en local, despliegue y URL pública |
| Acceso indebido entre barcos y manipulación de stock | Rechazados |
| Pedidos, compras, recepción parcial y transferencias | PASS |
| Reintento de operación ya guardada | Sin duplicado |
| Conflicto de revisión | HTTP 409 |
| Borrador de pedido tras desconexión | Recuperado y guardado en navegador |
| Trabajo con foto y respuesta perdida | Un único registro persistido; recuperación confirmada |
| Rutina semanal del caso de prueba | Próxima fecha 30/10/2026 |
| Cambio de barco con petición anterior pendiente | Sin bloqueo ni reemplazo por datos anteriores |
| Respaldo, restauración y repetición de restauración | PASS contra URL pública con barcos de QA |
| Cola push: concesión, respuesta obsoleta, reintento y endpoint vencido | PASS en transacción revertida |
| Recordatorio al rol chef y exclusión de lector | PASS en transacción revertida |
| Trabajador push autenticado | HTTP 200, configurado; cero envíos reales |
| Trabajador sin autorización y endpoint no admitido | Rechazados |
| Navegador móvil de 390 px en producción | Sin desbordamiento ni errores JavaScript |
| Reservas del CRM en producción | Seis reservas de Nomade consultadas |
| Cambio de asignación de barco en CRM | Vinculación automática deja de ser elegible; prueba revertida |

Se usaron cuatro cuentas y dos embarcaciones de QA. Se eliminaron tras las pruebas, incluidos sesiones, movimientos, pedidos, transferencias, fotos, respaldos, recibos de idempotencia y notificaciones de prueba. La comprobación posterior encontró un barco, una cuenta real, tres registros originales, cero existencias inventadas y seis reservas vinculadas. No se hicieron cobros ni se enviaron mensajes a huéspedes.

## Pendiente de operación real

Los equipos, horas, existencias y tripulantes deben cargarse con datos reales. Hay 37 tareas pendientes sin rol ni programación. Las seis reservas todavía no tienen fichas estructuradas de pasajeros en el CRM. La información que esté únicamente en el mail debe trasladarse al CRM o a observaciones operativas. Las instrucciones de cobro requieren verificación y capitán asignado.

La entrega push en teléfonos reales no está acreditada: cada integrante debe instalar/abrir la app, conceder permiso y comprobar una notificación de prueba. Confirmar un cobro en A bordo no concilia automáticamente el libro financiero del CRM.

La guía de uso y los comandos de prueba están en [A-BORDO-OPERACION.md](A-BORDO-OPERACION.md).
