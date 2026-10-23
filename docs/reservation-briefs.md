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
