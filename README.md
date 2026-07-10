# 🧭 Nomad Stock

Control de stock de **comida y bebida** para los charters de **Nomad Sailors**.
Pensada para usarse desde el **celular o tablet dentro del barco**: simple, rápida,
visual y con botones grandes. Es una **PWA** (se instala en la pantalla de inicio,
sin App Store ni Google Play).

> KPI: que un cocinero registre lo que preparó **en segundos**, sin renegar.

---

## ✨ Qué resuelve

- Saber **cuánto stock hay** y **cuánto vale**.
- Saber **qué ingredientes lleva cada plato** y su **costo real por porción**.
- **Descontar stock automáticamente** cuando el cocinero registra platos preparados.
- **Registrar consumo de bebidas** con un toque.
- **Cargar compras** y recalcular el **costo promedio ponderado**.
- **Alertas** de stock bajo/crítico, vencimientos y recetas sin stock.
- **Reportes** por período y por charter, con **export CSV**.

---

## 🧱 Stack

| Capa | Tecnología |
|---|---|
| Framework | **Next.js 14 (App Router)** + **TypeScript** |
| UI | **Tailwind CSS** + **shadcn/ui** (Radix) + **Lucide** |
| Formularios | **React Hook Form** + **Zod** |
| Gráficos | **Recharts** · Fechas: **date-fns** · Tablas: **TanStack Table** |
| Datos / Auth | **Supabase** (Postgres + Auth) — **opcional** |
| PWA | `@ducanh2912/next-pwa` (manifest + service worker) |
| Tema | `next-themes` (claro/oscuro) · Toasts: `sonner` |

---

## 🚀 Correr localmente (modo demo, sin configurar nada)

```bash
npm install
npm run dev
# abrí http://localhost:3000
```

**No necesitás Supabase para probar.** Si faltan las variables de entorno, la app
arranca en **Modo demo** con datos de ejemplo guardados en el `localStorage` del
navegador (verás un cartel “Modo demo”). Al entrar elegís un rol
(Admin / Cocinero / Solo lectura).

Para restaurar los datos de ejemplo: **Configuración → Restaurar datos demo**.

Scripts útiles:

```bash
npm run build      # build de producción
npm run start      # servir el build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
node scripts/gen-icons.mjs   # regenerar íconos PWA
```

---

## 🚀 Deploy en Vercel (URL pública + PWA en el celular)

Es un proyecto **Next.js estándar**: Vercel lo detecta solo, sin configuración.

1. Entrá a [vercel.com](https://vercel.com) → **Add New… → Project** → importá
   `Gsangui2001/control-de-stock-nomad`.
2. **Branch**: elegí `claude/nomad-stock-control-b6kq6h` (o `main` si ya mergeaste).
3. **Framework Preset**: *Next.js* (autodetectado). **Build**: `next build` ·
   **Output**: automático. No cambies nada.
4. **Environment Variables**: dejalas **vacías** para probar en **modo demo**. Si querés
   datos reales, agregá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (ver sección de Supabase).
5. **Deploy**. Te queda una URL tipo `https://nomad-stock-xxx.vercel.app`.
6. Abrí esa URL en el celular → **instalá la PWA**: Android (Chrome ⋮ → “Agregar a la
   pantalla principal”) · iPhone (Safari → Compartir → “Agregar a inicio”).

> Cada push a la branch conectada re-despliega solo. El service worker de la PWA se
> genera en el build de producción (está desactivado en `dev`).

---

## 🔌 Conectar Supabase (datos reales, multi-dispositivo)

1. Creá un proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor** → pegá y ejecutá `supabase/migrations/0001_init.sql`.
   Crea las tablas, RLS por rol, las RPCs `register_purchase` / `prepare_dish`,
   el trigger `handle_new_user` y unos datos demo.
3. Copiá `.env.example` a `.env.local` y completá:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
4. Reiniciá `npm run dev`. Al detectar las variables, la app usa Supabase
   automáticamente (adiós “Modo demo”).
5. **Usuarios y roles:** registrá usuarios en Supabase Auth. El trigger crea su fila
   en `profiles` con rol `lectura`. Cambiá el rol a `admin` o `cocinero` editando
   `profiles.role` en la tabla.

> La app funciona igual con o sin Supabase: la lógica de negocio vive en
> `lib/domain/stock.ts` y la usan tanto el repo demo como el de Supabase.

---

## 📲 Instalar como app (PWA)

La PWA se genera en `npm run build` / `npm run start` (está desactivada en `dev`).

- **Android (Chrome):** menú ⋮ → **“Agregar a la pantalla principal”**.
- **iPhone (Safari):** botón **Compartir** → **“Agregar a inicio”**.

Queda como una app a pantalla completa (`display: standalone`), con ícono de ancla y
color marítimo. Íconos y manifest están en `public/icons/` y `public/manifest.json`.

---

## 🗺️ Pantallas

1. **Dashboard** — valor del stock, consumo del día, críticos, platos de hoy, última
   compra, alertas, charter activo y **acciones rápidas**.
2. **Preparar platos** *(la más importante)* — cards grandes; elegís plato → porciones
   → ves qué se descuenta → **Confirmar**. Descuenta stock y registra el movimiento.
3. **Bebidas** — cards con **+ / −**, consumo múltiple y carga de stock de heladera.
4. **Stock** — buscar, filtrar por categoría, ver bajos, ajustar, historial.
5. **Compras** — carga multi-ítem; recalcula **costo promedio ponderado**.
6. **Platos / Recetas** — editor con ingredientes por porción y costo automático.
7. **Planificación** — calendario Día/Semana/Mes de comidas por charter + lista de compras.
8. **Charters** — asociar consumos; marcar charter activo.
9. **Reportes** — stock por categoría, consumo 7 días, por charter, alertas + **CSV**.
10. **Configuración** — moneda, permitir stock negativo, aviso de vencimiento, tema.

Navegación mobile: barra inferior (Inicio · Preparar · Bebidas · Stock · Más).
El **home del cocinero** es una vista simplificada (2 acciones grandes + “para reponer”);
el admin ve el dashboard completo.

---

## 🧮 Lógica clave

- **Costo promedio ponderado** (al comprar):
  `nuevo = (qActual·costoActual + qCompra·costoCompra) / (qActual + qCompra)`
- **Estado de stock:** `crítico` si `cantidad ≤ crítico`; `bajo` si `≤ mínimo`; si no `normal`.
- **Porciones posibles:** `min(stock_i / cantidadPorPorción_i)`.
- **Preparar plato:** por cada ingrediente descuenta `cantidadPorPorción × porciones`,
  crea un movimiento y calcula el costo total. Si falta stock y **no** está activado
  “permitir stock negativo”, **bloquea** con una alerta clara.

Ver `lib/domain/stock.ts` (funciones puras y testeables).

---

## 📅 Planificación de comidas (calendario)

En **Planificación** se arma el plan de comidas del charter por **Día / Semana / Mes**.
Cada día tiene 5 ranuras (**desayuno, almuerzo, merienda, cena, snack**) y cada ranura
puede tener **varios platos + bebidas**, con sus porciones (autocompletadas según los
**comensales del charter**, editables).

- **Planificar NO descuenta stock.** El descuento ocurre recién al tocar **“Marcar
  preparado”** en la ranura, que reutiliza la misma lógica de preparar plato /
  consumir bebida (así reportes, alertas y “platos de hoy” siguen andando).
- **Lista de compras sugerida** (botón 🛒): calcula los ingredientes necesarios de las
  comidas **planificadas** (no preparadas), los compara con el stock, detecta faltantes y
  arma la lista con cantidad a comprar y costo estimado (admin). Exportable a **CSV**.
- Roles: **todos** ven el calendario y pueden marcar preparado; **crear/editar** el plan
  es de admin.

Lógica pura en `lib/domain/planning.ts` (`computePlanNeeds`, `computeShortages`,
`buildShoppingList`).

---

## 🗃️ Base de datos (tablas)

| Tabla | Para qué |
|---|---|
| `profiles` | Usuarios y su **rol** (admin / cocinero / lectura) |
| `products` | Insumos y bebidas: cantidad, costo promedio, mínimo/crítico, ubicación, vencimiento |
| `recipes` + `recipe_items` | Platos estandarizados y sus ingredientes por porción |
| `purchases` + `purchase_items` | Compras y su detalle (precio total/unitario) |
| `prepared_dishes` | Platos preparados (receta, porciones, charter, costo) |
| `meal_plans` + `meal_plan_items` | **Planificación**: comidas por día/ranura/charter y sus platos+bebidas |
| `stock_movements` | **Auditoría**: todo cambio de stock con tipo, usuario y fecha |
| `charters` | Charters para asociar consumos (código, fechas, personas, estado) |
| `settings` | Moneda, permitir stock negativo, días de aviso de vencimiento |

> Migraciones: `0001_init.sql` (base) y `0002_meal_planning.sql` (planificación, aditiva).

Tipos de movimiento: `compra`, `preparacion`, `consumo_bebida`, `ajuste`, `merma`,
`devolucion`, `correccion`, `transferencia`.

---

## 🧭 Flujos rápidos

**Crear un producto** → Stock → botón **+** → nombre, categoría, unidad, cantidad,
costo, mínimo/crítico, ubicación → *Crear producto*.

**Crear una receta** → Platos → **+** → nombre e ícono → *Agregar* ingredientes
(producto + cantidad por porción) → el costo/porción se calcula solo → *Guardar*.

**Registrar platos preparados** → Preparar → tocar el plato → elegir porciones →
*Confirmar preparación*. (Descuenta ingredientes y suma al costo consumido.)

**Cargar una compra** → Compras → **+** → fecha/proveedor → *Ítem* por cada producto
(cantidad + precio total) → *Cargar compra*. (Suma stock y recalcula costos.)

**Consumo de bebida** → Bebidas → **−** para descontar de a uno, o *Consumo múltiple*.

---

## 🔐 Roles

| Rol | Puede |
|---|---|
| **Admin** | Todo: compras, insumos, recetas, costos, reportes, ajustes, usuarios |
| **Cocinero / Operario** | Preparar platos, registrar bebidas, ver stock y alertas |
| **Solo lectura** | Ver stock y reportes; no modifica datos |

En **modo demo**, cada uno elige su rol al entrar. Con **Supabase**, el rol sale de
`profiles.role`.

---

## 📁 Estructura

```
app/(app)/…        Pantallas (dashboard, preparar, bebidas, stock, compras, platos, charters, reportes, config)
app/login          Selector de rol (demo) / login
components/ui       Primitivos shadcn/ui
components/app      Shell (bottom nav, header), cards, stepper, alertas
lib/domain          Tipos, unidades, lógica pura (stock.ts), datos demo (seed.ts)
lib/repo            Repo (contrato), demoRepo (localStorage), supabaseRepo
lib/providers       RepoProvider (contexto + refetch)
supabase/migrations Esquema SQL (tablas, RLS, RPCs)
public/icons        Íconos PWA
```

---

Hecho para **Nomad Sailors** ⛵
