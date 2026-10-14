# Control del barco en Vercel

Proyecto existente: control-de-stock-nomad (equipo reviw).
Entrada: / → /a-bordo/index.html. Gastos anteriores: /gastos y /resumen-gastos.

## Datos y accesos

El control técnico usa /api/boat/* y tablas aisladas en el esquema boat_control del Supabase existente. No modifica las tablas de gastos, CRM ni Supabase Auth. Las cuentas técnicas tienen acceso por barco y roles capitán, marinero o lector. La cuenta administradora local y el barco Nomade se trasladaron conservando el hash de contraseña; no se copian sesiones locales.

El servidor usa BOAT_CONTROL_SERVER_SECRET, guardado únicamente como variable privada de Vercel. La base conserva su SHA-256. Las tablas no tienen permisos directos para anon/authenticated. El RPC valida la capacidad del servidor y después cada sesión/membresía; no admite consultas SQL arbitrarias. Nunca pasar el secreto al navegador. Las contraseñas usan PBKDF2-SHA256 y las sesiones de 24 horas cookies HttpOnly y SameSite=Strict. Cinco intentos incorrectos bloquean la cuenta por diez minutos.

Las fotos se guardan individualmente con acceso autenticado; los respaldos descargados vuelven a incluirlas. El registro usa revisión optimista para impedir sobrescrituras silenciosas. Toda actualización deja una entrada de auditoría. El límite del cuerpo del estado es 3,5 MB; fotos hasta 1,8 MB codificados por carga.

## Alcance

Gastos conserva su acceso anterior por Supabase. Gastronomía conserva almacenamiento local del navegador y no se sincroniza entre dispositivos. Cámaras contiene selección de equipos de 12 V y enlaces del proveedor; no se conectó hardware ni se verificó video real.

Actualmente Gustavo es la única cuenta administradora y la única persona con acceso asignado. Los demás usuarios se crearán más adelante. El permiso `encargado` queda disponible únicamente para una futura persona expresamente autorizada; es el único rol no administrador que puede gestionar el manual de instrucciones y las cámaras. Capitán, marinero y lector no reciben el contenido de cámaras en la API.

## Validación

Compilación Next y TypeScript; pruebas HTTP contra la base real con cuenta y barco temporales: inicio/cierre de sesión, guardado y lectura, fotos privadas, conflicto de revisión, aislamiento por barco y bloqueo de escritura para lector. Revisión de escritorio y móvil en navegador. Los datos temporales deben retirarse al terminar.

Para desplegar: enlazar este directorio al proyecto indicado, configurar las tres variables (URL y anon key de Supabase más secreto privado), aplicar las migraciones una vez, generar una publicación de producción sin asignar dominio, comprobarla y promoverla. No desplegar la raíz del proyecto local ni archivos SQLite, .work o .env.
