# Stock Tierra: conteo por foto (cambio en revisión)

1. Administración abre **Stock de barcos y depósito** y elige **Depósito**.
2. Toca **Sacar foto** o **Elegir foto**. La lectura arranca al elegir la imagen.
3. Revisa los productos, cantidades, unidades y ubicaciones. Los artículos conocidos conservan sus datos. Para una lista de artículos nuevos se puede elegir el área y declarar «unidad» una sola vez. Si no se pudo leer una cantidad o hay más de una coincidencia, no se actualiza hasta resolverlo.
4. Toca **Confirmar y actualizar Stock Tierra**. Solo se reemplazan cantidades de la lista; el resto del inventario, los costos y los barcos no se tocan. Si se pierde la conexión después de confirmar, usa **Verificar guardado pendiente** en el mismo navegador y cuenta, sin volver a cargar el conteo.

El módulo Tierra ya no muestra el formulario que obliga a ingresar renglón por renglón. Para Nomadé y cualquier barco dado de alta se inicia la lectura al elegir una foto en **Conteo de existencias**. Se conserva la confirmación de Administración que ya existía para barcos. Esto no crea Stock Lagoon ni cambia accesos.

QA: usar únicamente una base de prueba. La API bloquea el guardado de Stock Tierra en previews de Vercel. La carga usa un lote transaccional con revisión y recibo idempotente, no modifica Finanzas y no persiste en el servidor la imagen de Tierra. La migración debe aprobarse y aplicarse antes de abrir la función en producción. Verificar cámara y galería de un iPhone real antes de distribuirla.

Pruebas con `node --test tests/boat-depot-photo.cjs`. Con `@electric-sql/pglite` instalado se ejecuta además el caso SQL aislado. Para la prueba móvil con OCR y API simulados, habilitar `STOCK_TEST_BROWSER=1` y usar `playwright-core` más `CHROMIUM_BIN` o `@sparticuz/chromium`.
