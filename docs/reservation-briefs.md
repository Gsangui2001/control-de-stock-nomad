# Fichas de viaje del Nomade

Carlota completa la ficha en la reserva del CRM y toca Listo para aprobar y
publicar en una sola acción. En A bordo → Reservas, administración puede revisar el borrador.
La reserva debe estar confirmada o en curso y asignada inequívocamente al Nomade.

Desde el 24/10/2026, la vista es una ficha breve de **Información del huésped**:
fechas, cliente, pasajeros, país, aire acondicionado, llegada/salida, comidas,
bebidas y experiencia. País y aire acondicionado se completan explícitamente y
forman parte de la misma aprobación. Los datos desconocidos quedan pendientes;
un guion no significa ausencia de alergias. Se conservan todas las restricciones
registradas por pasajero y en la ficha. Las notas internas no se muestran en la
tarjeta ni se entregan en el payload de tripulación. El capitán recibe únicamente la ficha aprobada y su confirmación de lectura;
no recibe contacto, notas internas ni datos de cobro. Administración y encargado
conservan el contacto según sus permisos. Los controles administrativos quedan
plegados y el tripulante confirma con **Ya la revisé**, ligado a la versión.

Regresión de la vista: `node --test tests/boat-guest-card.cjs`. La ampliación de
campos y los controles de aprobación se verifican en la suite Nomad indicada abajo.

La publicación crea una versión inmutable, avisos para los miembros actuales
(capitán, chef, marinero, encargado) y trabajos durables de notificación para
los teléfonos suscriptos. El aviso abre la reserva; marcar el aviso como leído
no confirma la revisión. Cada integrante pulsa **Revisé la ficha**. Se guarda
persona, rol, versión y fecha. Administración ve quién sigue pendiente.

Los cambios del borrador requieren publicar otra versión. Los cambios del CRM
se detectan al leer o confirmar: impiden revisar información desactualizada
hasta una nueva publicación. Cancelaciones y cambios de barco quitan el acceso.
El cambio de confirmada a en curso conserva la ficha. La migración no publica
reservas ni confirma su estado comercial. Reintentos con la misma clave no
duplican publicación, aviso ni revisión; publicar sin cambios tampoco avisa.

La tripulación solo recibe versiones publicadas. Cocina y marinero no reciben
teléfono/email del cliente ni importes del CRM. El payload del capitán también excluye instrucciones e informes de cobro.

## Otros barcos

Administración dispone de **Plantillas para otros capitanes**. Consulta las
reservas próximas con una asignación no ambigua a otros barcos, revisa/completa
el texto y lo copia o descarga para el canal habitual. No agrega esos barcos
al circuito de la tripulación del Nomade. Copiar o descargar no envía mensajes,
no registra recepción y no altera confirmaciones de capitán en el CRM.

## Verificación

- `tests/boat-briefs.sql`: transacción revertida; publicación, aislamiento,
  privacidad, versiones, idempotencia, CRM desactualizado y cancelación.
- `tests/boat-briefs-browser.js`: fixture de navegador móvil con datos ficticios;
  borrador, bloqueo de publicación sin guardar, publicación, plantilla y revisión.
- `tests/boat-briefs-http.cjs`: lectura autenticada y rechazos de permisos en API,
  con sesiones temporales privadas; no publica clientes.
- Build y typecheck. No se añaden dependencias.

La entrega de una notificación en un teléfono requiere activar los avisos en
ese dispositivo y comprobar recepción real. Un trabajo en cola o la aceptación
del proveedor no se presenta como evidencia de recepción por la tripulación.

Los registros importados que solo dicen Nomade/NOMADE como texto libre quedan
fuera de las plantillas externas. Deben vincularse al barco canónico en el CRM
antes de ingresar al circuito de publicación; no se reasignan por nombre.

Verificado el 23/10/2026: despliegue público `dpl_841hcA5Midcfo3yHdQvG44b6iFYG`,
frontend `881d69f`, build y API por roles aprobados. Ocho archivos públicos
coinciden byte a byte con la versión probada. Interfaz móvil verificada con
fixture de publicación/revisión y lectura de producción. Cero publicaciones,
revisiones o avisos reales de prueba. Recepción push en teléfonos pendiente de
activación; había cero suscripciones activas.

Desde el circuito CRM del 23/10, toda nueva publicación exige aprobación de Carlota en la reserva. La migración 20261023230725_crm_nomade_brief_approval, mantenida en Nomad, agrega el RPC autenticado y un trigger que bloquea publicaciones desde el camino antiguo. La app conserva borradores y acuses; enlaza al CRM para aprobar y publicar. Ver docs/nomade-brief-crm-2026-10-23.md en Nomad. La prueba SQL histórica de este repositorio describe el estado anterior a ese trigger; la suite vigente de aprobación está en tests/nomade-brief de Nomad.

El límite de campos del capitán se aplica en el RPC, mediante la migración nomade_captain_card_only del CRM. La interfaz también oculta contactos de respuestas antiguas en caché. La confirmación Ya la revisé se conserva por versión.
