# Fichas de viaje del Nomade

En A bordo → Reservas, administración revisa los datos del CRM, completa el
borrador y pulsa **Publicar para la tripulación**. La reserva debe estar
confirmada o en curso y asignada inequívocamente al Nomade en el CRM.

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
teléfono/email del cliente ni importes del CRM. Se conserva el control previo
de instrucciones de cobro para el capitán asignado.

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
