# A bordo: uso de Nomade

Aplicación: https://control-de-stock-nomad.vercel.app/a-bordo/index.html

La versión operativa es la aplicación publicada desde `vercel-app`. El servidor Python/SQLite de la carpeta superior es una versión local independiente; las operaciones nuevas usan Supabase y no deben probarse contra ese servidor.

## Empezar

1. Entrar con la cuenta existente de administración y abrir **Preparar barco**.
2. En administración, crear una cuenta personal para cada integrante y asignarle Nomade y su rol. No compartir la cuenta de administración.
3. Cargar equipos y horas leídas a bordo. Confirmar rol, fecha y frecuencia de cada rutina antes de activarla. Una tarea sin fecha ni horas objetivo figura **Sin programación**.
4. En **Inventario de flota**, cargar cantidades contadas, unidad y ubicación. La importación de un respaldo gastronómico exige revisar cada producto; no carga automáticamente el inventario de demostración.
5. En **Notificaciones**, activar el dispositivo y enviar una prueba. En iPhone hay que agregar la app a la pantalla de inicio y abrirla desde allí.

## Trabajo cotidiano

- **Manual** muestra el capítulo del rol seleccionado. Administración puede consultar el documento completo con Todos.
- **Mis tareas** agrupa Motor babor, Motor estribor, Generador y los demás sistemas. Registrar un trabajo conserva autor, fecha, observaciones, materiales y fotos. Una rutina confirmada calcula su próxima fecha u horas a partir del trabajo registrado.
- **Pedidos** separa cocina/bebidas y mecánica. Los faltantes pasan de borrador a solicitado, aprobado y comprado; recibir mercadería aumenta stock. Se admiten recepciones parciales y descarga consolidada CSV. Marcar comprado por sí solo no suma existencias.
- **Stock** comparte existencias dentro del mismo barco. Una transferencia descuenta del origen, queda en tránsito y suma al destino al recibirse. Se verificó con barcos de prueba; actualmente el único barco real habilitado es Nomade.
- Los formularios conservan borradores y fotos en IndexedDB del navegador. Ante una respuesta perdida se reutiliza la misma operación. **Revisar guardado pendiente** comprueba el guardado antes de permitir otro. No equivale a una aplicación completamente sin conexión: abrirla, consultar datos y confirmar operaciones requiere conexión. Borrar los datos del navegador elimina borradores locales.

## Reservas y cobros

Nomade está vinculado al registro del CRM **Lagoon 57 - Nomade**. Las reservas futuras con relación `booked`, sin otro barco seleccionado/contratado, se vinculan al consultarlas. Las meras ofertas no se incorporan. Si cambia la asignación en el CRM, una vinculación automática deja de mostrarse a la tripulación anterior. Las vinculaciones manuales siguen siendo responsabilidad de administración.

Fechas, pasajeros, preferencias alimentarias, alimentos a evitar, solicitudes e intereses se leen del CRM. Los campos sin completar se muestran como no informados. La app permite agregar observaciones operativas complementarias. No extrae automáticamente texto de correos: cualquier detalle que exista solamente en la confirmación por mail debe incorporarse al CRM o a esas observaciones.

Administración asigna el capitán y verifica importe, moneda, concepto y fecha de cobro. Solamente administración y el capitán asignado ven la instrucción financiera. Chef y marinero reciben información operativa. Si cambia la base financiera del CRM, la instrucción se invalida hasta volver a verificarla.

El capitán informa un cobro; administración lo confirma o rechaza. **Informado no significa confirmado**. Esta confirmación operativa no registra ni concilia automáticamente movimientos en el libro financiero del CRM.

## Respaldo y recuperación

Preparar barco permite descargar una copia completa del estado, pedidos, transferencias, reservas vinculadas, instrucciones, cobros y fotos. La restauración exige el mismo barco y una revisión vigente; descarga una copia previa y guarda además una versión anterior en el servidor.

La restauración normal recupera estado, tareas, inventario, pedidos y fotos. Rechaza un respaldo si sus transferencias o registros financieros difieren de los actuales: esos casos necesitan recuperación coordinada, para no duplicar dinero o existencias entre barcos. El límite de carga es 3,5 MB; copias mayores necesitan asistencia.

## Datos pendientes al 23/10/2026

- Nombres y cuentas de capitán, chef y marinero. Solo se conserva el administrador real existente.
- Equipos/modelos, horas actuales y frecuencias confirmadas. Las 40 tareas existentes carecen de programación/rol confirmado.
- Inventario contado, unidades y ubicaciones. No se inventaron existencias.
- Seis reservas futuras vinculadas; ninguna tiene todavía fichas de pasajeros en `opportunity_passengers`. Revisar preferencias que estén únicamente en los correos.
- Capitán responsable e instrucciones de cobro verificadas para cada reserva.
- Activación y recepción de una notificación en los teléfonos reales. No había suscripciones activas al verificar.

## Validación técnica

- `node tests/boat-roles.cjs`: roles, manual, tareas ocultas, fusión de cambios, autoría y conflictos.
- `tests/boat-operations.sql` y después `tests/boat-notifications.sql`: ejecutar siempre dentro de una única transacción con ROLLBACK. Incluyen permisos, recepciones, transferencias, cobros, reintentos, exclusión entre trabajadores de notificaciones y caducidad de suscripciones. Nunca ejecutar el archivo SQL suelto en producción.
- `node tests/boat-http.cjs`: requiere credenciales de cuentas/embarcaciones exclusivamente de QA en `.work/qa-credentials.json`; `BOAT_QA_URL` elige el entorno. `BOAT_QA_ACCESS` admite un archivo privado de cookies para un despliegue protegido. No utiliza cuentas de clientes.
- Pruebas HTTP realizadas localmente y sobre el despliegue: cuatro roles, acceso entre barcos, compras parciales, transferencias, reintento exacto, conflicto de revisión, manipulación de stock y protección del trabajador push.
- Navegador móvil de 390 px: pedido persistido, borrador tras desconexión, trabajo con foto, respuesta perdida y recuperación sin duplicar, reprogramación semanal y seis reservas reales leídas del CRM.
- Exportación/restauración de respaldo y repetición idempotente verificadas con datos de QA.
- Compilación de producción y comprobación de tipos completadas en Vercel.

Las notificaciones usan una cola persistente, concesiones temporales para evitar dos trabajadores simultáneos, reintentos limitados y cron cada cinco minutos. Los recordatorios se generan una vez al día por barco desde las 08:00 de Panamá, para tareas con vencimiento real. El permiso y la entrega efectiva en Android/iPhone deben comprobarse en cada dispositivo.
