# A bordo: propuesta de puesta en marcha

Revisión del 23 de octubre de 2026. Alcance: seis audios de WhatsApp del 22 de octubre, código publicado y consultas de solo lectura a la base de producción. Este documento es una propuesta; no acredita implementación ni despliegue de las mejoras.

## Evidencia actual

- La URL pública responde HTTP 200. El contenido de index.html, app.js, daily.js y boat-rules.js coincide con el checkout de vercel-app (ignorando finales de línea).
- Producción contiene un barco, Nomade; una cuenta administradora, Gustavo; 40 tareas, tres registros de trabajos, cero productos técnicos, cero compras y cero equipos. No se inspeccionó el almacenamiento gastronómico de cada teléfono.
- Las 40 tareas carecen de rol asignado, próxima fecha y frecuencia. Tres figuran realizadas. El sistema permite configurar estos campos, pero todavía no están configurados.
- El manual contiene 30.927 caracteres. Los filtros actuales conservan los capítulos comunes junto con el capítulo de cada rol: esto explica la sensación de manual repetido que señala el audio.
- Los avisos de actividad se consultan cada minuto para administración mientras la aplicación está abierta. No existe implementación de notificaciones push en el módulo.
- Gastronomía conserva el prototipo de restaurante: localStorage, reservas por mesa y datos de ejemplo si el navegador no tiene guardado. No es todavía el inventario compartido de la flota ni la agenda de charters.
- Existen tablas de reservas y transportes en el CRM, y estructuras financieras vinculadas a oportunidades. Falta verificar el mapeo de barcos, la fuente de preferencias y el cálculo autorizado del saldo antes de integrar.
- Las pruebas existentes de roles, protección de tareas, manual y filtrado de API pasan. No sustituyen una prueba completa entre teléfonos ni verifican las funciones nuevas propuestas.

## Pedidos de los audios y solución propuesta

Las transcripciones son automáticas. Se normalizan expresiones evidentes como babor/estribor; las frases poco claras no se toman como nuevos requisitos ni como autorización para operar cuentas, dinero o reservas.

| Audio | Pedido | Cambio propuesto |
|---|---|---|
| 12:50:38 | Acceso rápido a las responsabilidades de capitán, chef y marinero, sin repetir el manual completo | Mantener Manual general completo. Cada botón de rol abre únicamente su capítulo y sus instrucciones vinculadas. Un enlace separado permite consultar normas generales. Edición central con versión, fecha y autor para evitar copias divergentes. |
| 12:57:26 | Agrupar mantenimiento por motor estribor, motor babor y generador | Tres tarjetas con pendientes y vencidos; al abrir, aparecen filtros, correas, aceite y demás tareas correspondientes. Equipos, horas e historial independientes. Confirmar qué tareas aplican a cada equipo y sus intervalos. |
| 13:02:02, 00:00–00:47 | Acumular faltantes de cocina y mecánica en pedidos separados | Botón Falta algo accesible aunque el producto todavía no exista. Área, producto, cantidad, unidad, urgencia y foto. Consolidación por barco y área; estados borrador, solicitado, aprobado, comprado, recibido y cancelado. Recepciones parciales; aumentar stock solo por lo recibido. |
| 13:02:02, 00:47–01:19 | Notificaciones al celular sin revisar la aplicación constantemente | Suscripción push por usuario y dispositivo; avisos de trabajo realizado, problemas, vencimientos y pedidos. Bandeja interna persistente, reintentos y control de duplicados. Configuración de destinatarios y prueba en el teléfono real. |
| 13:03:32 | Ver stock gastronómico de otros barcos e intercambiar mercadería | Inventario central por barco y área, unidades consistentes y consulta según permisos. Transferencia con origen, destino, cantidad, responsable, estado y confirmación de recepción. Salida y entrada vinculadas; impedir stock negativo y repetición al reintentar. |
| 13:05:26 | Ver reservas y preferencias cargadas por Carlota | Agenda por barco y fecha; ficha de pasajeros, alimentación, alergias, bebidas, actividades, transporte y observaciones. Integrar la fuente existente del CRM; mantener una única fuente de actualización. Tripulación consulta solo sus viajes y la información necesaria. |
| 13:08:26 | Destacar cuánto debe cobrar el capitán y restringir su visibilidad | Bloque Cobrar al huésped para el capitán asignado y administración autorizada: importe, moneda, concepto, fecha y estado. Carlota valida la fuente del importe. Registrar cobro informado separado de cobro confirmado; no considerar un aviso leído como pago. |

## Orden de implementación

1. **Uso diario y configuración.** Corregir manual y agrupación por equipo; configurar responsables y rutinas; cargar equipos y existencias contadas; preparar accesos personales para las personas que se designen. Incorporar un indicador de preparación que muestre datos faltantes. No cargar cantidades ni frecuencias técnicas supuestas.
2. **Abastecimiento compartido.** Migrar Gastronomía al servidor con separación por barco y área, conservar e importar guardados reales previa revisión, apartar la demo del uso operativo y desarrollar pedidos, recepciones y transferencias.
3. **Reservas y cobros.** Vincular los barcos y reservas del CRM; presentar preferencias y cobros según rol. Carlota revisa un viaje completo y sus importes antes de habilitar su uso operativo.
4. **Notificaciones y prueba de jornada.** Construir eventos y bandeja junto con los módulos anteriores; habilitar push y comprobar recepción en los dispositivos reales con la aplicación cerrada. Verificar reintentos, permisos y enlaces que abren el registro correcto.

La primera etapa permite empezar a usar el control diario. El alcance completo pedido en los audios requiere terminar las cuatro.

## Mejoras adicionales recomendadas

- Inicio con accesos claros: Mi día, Mantenimiento, Insumos y pedidos, Reservas y Manual; selector visible del barco. Administración conserva una vista consolidada.
- Diferenciar tareas de hoy, próximas, vencidas, bloqueadas y sin programación. Evitar que una tarea sin fecha se interprete como mantenimiento al día.
- Guardar borradores de texto y fotos ante pérdida de conexión. Mostrar pendiente de envío y última sincronización; no confirmar guardado sin respuesta comprobada del servidor.
- Guardar operaciones individuales y su identificador de reintento para compras, consumos y transferencias. Revisar permisos de edición del historial y reconciliar una respuesta de guardado perdida antes de repetirla.
- Alertas críticas separadas de resúmenes, con acuse de lectura cuando corresponda. Leer una alerta no equivale a resolver un problema ni a cobrar.
- Respaldo recuperable y ensayo de restauración; historial de quién cambió qué y cuándo.

## Criterios para decir que está listo

1. Capitán, chef y marinero entran con cuentas distintas; ven sus tareas y permisos correctos. Otro barco no queda accesible sin asignación.
2. Registrar un trabajo con foto y consumo actualiza inventario e historial una sola vez, persiste al recargar y reprograma la rutina configurada.
3. El chef pide un producto desde su teléfono; administración lo ve desde otro; una recepción parcial incrementa únicamente lo recibido y conserva el pendiente.
4. Transferir dos unidades entre dos barcos deja dos movimientos vinculados y no duplica existencias ante reintentos. Cancelaciones y diferencias de recepción quedan trazadas.
5. Carlota actualiza una reserva una sola vez y el barco ve el dato actualizado. Alergias destacan para quienes necesitan atenderlas; el importe a cobrar no se expone a chef o marinero.
6. El capitán informa un cobro; la persona autorizada lo confirma. La reserva y el saldo no se alteran solo por marcar una notificación como vista.
7. Una notificación llega al teléfono autorizado con la aplicación cerrada y abre el registro correcto. Si no hay conexión, el registro sigue disponible en la bandeja y el envío se recupera sin duplicados.
8. Se prueba una interrupción de red, una edición concurrente y la recuperación de un respaldo. No se pierden formularios ni se anuncian operaciones como guardadas sin confirmación.

## Datos necesarios para completar la puesta en marcha

Personas y roles por barco; barcos que participarán; inventario físico, unidades y ubicaciones; equipos y horas reales; rutinas confirmadas; fuente de preferencias y reservas de Carlota; regla y fuente del importe a cobrar; teléfonos de prueba y permisos de notificación. Son datos de operación que no se pueden deducir de los audios.

## Referencias técnicas

- Implementación revisada: vercel-app/public/a-bordo/{app.js,daily.js,boat-rules.js}, gastronomia/app.js y app/api/boat/[operation]/route.ts.
- Validación ejecutada: node tests/boat-roles.cjs.
- En iPhone/iPad, Web Push requiere una aplicación web añadida a inicio y permiso solicitado por una acción del usuario en versiones compatibles: https://webkit.org/blog/13878/.
- Recepción de eventos push mediante service worker: https://developer.mozilla.org/en-US/docs/Web/API/Push_API.
