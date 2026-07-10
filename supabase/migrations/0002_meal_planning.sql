-- Nomad Stock — Etapa 2: planificación de comidas (aditivo, no toca 0001_init.sql)
-- Ejecutá este archivo DESPUÉS de 0001_init.sql en el SQL Editor de Supabase.

-- =========================================================
-- Tablas
-- =========================================================
create table if not exists meal_plans (
  id uuid primary key default gen_random_uuid(),
  charter_id uuid references charters(id) on delete set null,
  date date not null,
  slot text not null,                 -- desayuno | almuerzo | merienda | cena | snack
  status text not null default 'planificado', -- planificado | preparado
  prepared_dish_ids uuid[] default '{}',
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists meal_plans_charter_idx on meal_plans(charter_id);
create index if not exists meal_plans_date_idx on meal_plans(date);

create table if not exists meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references meal_plans(id) on delete cascade,
  kind text not null,                 -- 'plato' | 'bebida'
  recipe_id uuid references recipes(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  servings numeric,                   -- para platos
  quantity numeric,                   -- para bebidas
  unit text
);
create index if not exists meal_plan_items_plan_idx on meal_plan_items(meal_plan_id);

-- =========================================================
-- RLS (mismos helpers is_admin() / can_write() de 0001)
-- =========================================================
alter table meal_plans enable row level security;
alter table meal_plan_items enable row level security;

create policy meal_plans_read on meal_plans
  for select using (auth.role() = 'authenticated');
create policy meal_plans_write on meal_plans
  for all using (can_write()) with check (can_write());

create policy meal_plan_items_read on meal_plan_items
  for select using (auth.role() = 'authenticated');
create policy meal_plan_items_write on meal_plan_items
  for all using (can_write()) with check (can_write());

-- Nota: "planificar" NO descuenta stock. El descuento ocurre al marcar la comida
-- como preparada, reutilizando la lógica de prepare_dish / consumo de bebida
-- (orquestada desde la app, o vía las RPCs de 0001_init.sql).
