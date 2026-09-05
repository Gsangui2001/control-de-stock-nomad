# ⚓ NOMADE

Administrador de **gastos operativos de la flota** de Nomad Sailors: mantenimiento y reparaciones,
combustible, amarre/marina/permisos, y otros gastos operativos (tripulación, limpieza, insumos), con
foto de factura adjunta. Pensada para usarse desde el **celular** — simple, rápida, botones grandes.
Es una **PWA** (se instala en la pantalla de inicio, sin App Store ni Google Play).

> KPI: que Boris cargue un gasto **en segundos**, con foto de la factura, sin renegar.

Este repo es independiente del CRM de Nomad Sailors (`github.com/Gsangui2001/Nomad`), pero **usa la
misma base de Supabase** — ver la sección de Supabase más abajo y `docs/111-nomade-gastos-de-flota.md`
en ese otro repo.

---

## ✨ Qué resuelve

- Cargar un gasto del barco (categoría, monto en USD, fecha, proveedor, descripción) en segundos.
- Adjuntar la foto de la factura y, con IA, precargar monto/fecha/proveedor automáticamente — vos
  confirmás antes de guardar.
- Ver cuánto se gastó este mes y por categoría, sin abrir una planilla.
- Exportar el detalle a CSV para el período que necesites.

---

## 🧱 Stack

| Capa | Tecnología |
|---|---|
| Framework | **Next.js 14 (App Router)** + **TypeScript** |
| UI | **Tailwind CSS** + **shadcn/ui** (Radix) + **Lucide** |
| Gráficos | **Recharts** · Fechas: **date-fns** |
| Datos / Auth | **Supabase** (Postgres + Auth) — el mismo proyecto que el CRM |
| PWA | `@ducanh2912/next-pwa` (manifest + service worker) |
| Tema | `next-themes` (claro/oscuro) · Toasts: `sonner` |

---

## 🚀 Correr localmente (modo demo, sin configurar nada)

```bash
npm install
npm run dev
# abrí http://localhost:3000
```

**No necesitás Supabase para probar.** Si faltan las variables de entorno, la app arranca en
**Modo demo** con datos de ejemplo guardados en el `localStorage` del navegador (verás un cartel
"Modo demo"). Al entrar elegís un rol (Admin / Gestor).

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
2. **Framework Preset**: *Next.js* (autodetectado). No cambies nada.
3. **Environment Variables**: dejalas **vacías** para probar en **modo demo**. Para datos reales,
   ver la sección de Supabase más abajo.
4. **Deploy**.
5. Abrí esa URL en el celular → **instalá la PWA**: Android (Chrome ⋮ → "Agregar a la pantalla
   principal") · iPhone (Safari → Compartir → "Agregar a inicio").

---

## 🔌 Supabase — la misma base que el CRM, no una propia

Ver **`supabase/README.md`** para el detalle completo. En resumen: esta app no crea su propio
proyecto de Supabase — usa el mismo que el CRM de Nomad Sailors, en tablas nuevas y aisladas
(`boat_expense_users`, `boat_expenses`) que no tocan nada del CRM. El esquema real es una migración
del repo del CRM, no de este repo.

1. Pedí `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` — son las mismas que ya usa el
   CRM — y cargalas en `.env.local` (dev) o en *Vercel → Settings → Environment Variables* (prod).
2. Confirmá con quien administra ese proyecto que la migración
   `20260905130000_gastos_de_flota_nomade.sql` ya está aplicada.
3. **Primer usuario:** entrá a `/login`, **Crear cuenta** con tu email y contraseña. Si el proyecto
   tiene "Confirm email" activado, confirmá el correo antes de entrar. Al primer login te crea tu
   fila en `boat_expense_users` con rol `gestor` por default.
4. **Hacete admin:** en el *SQL Editor* del proyecto de Supabase corré (una vez, con tu email):
   ```sql
   update boat_expense_users set role = 'admin'
   where id = (select id from auth.users where email = 'vos@ejemplo.com');
   ```
   Volvé a entrar y ya tenés todos los permisos. A Boris se le asigna `gestor` del mismo modo (que
   ya es el default).

> La app funciona igual con o sin Supabase: la lógica de negocio vive en `lib/domain/` y la
> comparten el modo demo y el modo Supabase.

---

## 🧾 Escanear factura (IA)

En **Gastos → Nuevo gasto** hay un botón **"Adjuntar foto de factura"**: sacás una foto y la app
completa automáticamente proveedor, fecha, monto y una categoría sugerida — revisás y confirmás
antes de guardar. La foto queda adjunta al gasto haya podido leerla o no.

Requiere una API key de Anthropic (usa un modelo Claude con visión):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Conseguila en [console.anthropic.com](https://console.anthropic.com) y cargala en `.env.local`
(dev) o en *Vercel → Settings → Environment Variables* (prod). **Sin esta variable, el botón
muestra un error pero la foto se adjunta igual** — es opcional, no se necesita para cargar un gasto
a mano.

La categoría sugerida **nunca se guarda sola**: queda preseleccionada con un aviso, y quien carga el
gasto la confirma o la cambia antes de guardar.

---

## 📲 Instalar como app (PWA)

La PWA se genera en `npm run build` / `npm run start` (está desactivada en `dev`).

- **Android (Chrome):** menú ⋮ → **"Agregar a la pantalla principal"**.
- **iPhone (Safari):** botón **Compartir** → **"Agregar a inicio"**.

Queda como una app a pantalla completa (`display: standalone`), con ícono de ancla y color marítimo.
Íconos y manifest están en `public/icons/` y `public/manifest.json`.

---

## 🗺️ Pantallas

1. **Inicio** — gasto del mes, desglose por categoría, últimos gastos cargados.
2. **Gastos** *(la más importante)* — cargar un gasto (barco, categoría, monto, fecha, proveedor,
   descripción, foto de factura) y ver el listado completo.
3. **Reportes** — total y desglose por categoría en un rango de fechas, exportable a CSV.
4. **Barcos** *(solo admin)* — catálogo de solo lectura: se carga y edita desde el CRM.
5. **Configuración** *(solo admin)* — sesión activa, restaurar datos demo.

Navegación mobile: barra inferior (Inicio · Gastos · Reportes · Más).

---

## 🗃️ Base de datos (tablas)

| Tabla | Para qué |
|---|---|
| `boat_expense_users` | Usuarios propios de NOMADE y su **rol** (admin / gestor) — no es `profiles` del CRM |
| `boat_expenses` | Cada gasto: barco, categoría, monto USD, fecha, proveedor, descripción, foto de factura |
| `boats` *(del CRM, solo lectura)* | El catálogo real de barcos — NOMADE solo lee el nombre |

Categorías fijas: `mantenimiento`, `combustible`, `amarre_marina_permisos`, `otros_operativos`.

> El esquema real vive en el repo del CRM — ver `supabase/README.md`.

---

## 🔐 Roles

| Rol | Puede |
|---|---|
| **Admin** | Todo: cargar/editar/borrar gastos, ver reportes, ver el catálogo de barcos |
| **Gestor** | Cargar y editar gastos de cualquier barco. No borra ni administra barcos |

En **modo demo**, cada uno elige su rol al entrar. Con **Supabase**, el rol sale de
`boat_expense_users.role`.

---

## 📁 Estructura

```
app/(app)/…        Pantallas (dashboard, gastos, reportes, barcos, configuración)
app/login          Selector de rol (demo) / login
app/api/scan-invoice  Escaneo de factura por IA
components/ui       Primitivos shadcn/ui
components/app      Shell (bottom nav, header), cards
lib/domain          Tipos, categorías, lógica pura (expenses.ts), datos demo (seed.ts)
lib/repo            Repo (contrato), demoRepo (localStorage), supabaseRepo
lib/providers       RepoProvider (contexto + refetch)
supabase/README.md  Apunta al esquema real, que vive en el repo del CRM
public/icons        Íconos PWA
```

---

Hecho para **Nomad Sailors** ⛵
