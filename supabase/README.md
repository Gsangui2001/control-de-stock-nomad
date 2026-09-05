# Base de datos

Esta app **no tiene su propio proyecto de Supabase**: usa el mismo proyecto que el CRM de Nomad
Sailors (`github.com/Gsangui2001/Nomad`).

El esquema real (`boat_expense_role`, `boat_expense_users`, `boat_expenses`, más la policy agregada
de solo lectura sobre `public.boats`) vive como una migración numerada en el repositorio del CRM:

```
supabase/migrations/20260905130000_gastos_de_flota_nomade.sql
```

y se explica en `docs/111-nomade-gastos-de-flota.md` de ese mismo repo. El registro de migraciones
del CRM es la única fuente de verdad de qué tablas existen — no se duplica un segundo registro acá.

**Variables de entorno necesarias** (`.env.local` o Vercel → *Settings → Environment Variables*):

```
NEXT_PUBLIC_SUPABASE_URL=<la del proyecto de Supabase del CRM>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<la del proyecto de Supabase del CRM>
```

Son las mismas dos variables que ya usa el CRM — pedíselas a quien administra ese proyecto. Sin
ellas, la app arranca en **Modo demo** (datos de ejemplo en `localStorage`, sin backend).
