-- Nomad Stock — esquema inicial de Supabase
-- Ejecutá este archivo en el SQL Editor de tu proyecto Supabase.
-- Incluye: tablas, RLS por rol, RPCs atómicas (register_purchase / prepare_dish)
-- y datos demo mínimos.

-- =========================================================
-- Extensiones
-- =========================================================
create extension if not exists "pgcrypto";

-- =========================================================
-- Perfiles y roles
-- =========================================================
create type user_role as enum ('admin', 'cocinero', 'lectura');

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text,
  role user_role not null default 'lectura',
  created_at timestamptz not null default now()
);

-- Crea un perfil automáticamente al registrarse un usuario.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.email, 'lectura');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Helpers de rol
create or replace function is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
create or replace function can_write() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','cocinero'));
$$;

-- =========================================================
-- Catálogos / dominio
-- =========================================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,          -- carnes | pescados | verduras | frutas | secos | lacteos | condimentos | bebidas | limpieza
  unit text not null,              -- g | kg | ml | l | unidad | botella | lata | pack
  current_quantity numeric not null default 0,
  average_unit_cost numeric not null default 0,
  minimum_quantity numeric not null default 0,
  critical_quantity numeric not null default 0,
  location text not null default 'cocina',
  supplier text,
  expiration_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text,
  image_url text,
  icon text,
  active boolean not null default true,
  prep_notes text,
  reference_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity_per_serving numeric not null,
  unit text not null
);
create index if not exists recipe_items_recipe_idx on recipe_items(recipe_id);

create table if not exists charters (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  customer_name text,
  start_date date,
  end_date date,
  guest_count int,
  boat text,
  status text not null default 'proximo', -- proximo | activo | finalizado
  notes text,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  supplier text,
  total_amount numeric not null default 0,
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity numeric not null,
  unit text not null,
  total_price numeric not null,
  unit_price numeric not null
);

create table if not exists prepared_dishes (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references recipes(id) on delete set null,
  recipe_name text not null,
  servings numeric not null,
  charter_id uuid references charters(id) on delete set null,
  prepared_by text,
  prepared_at timestamptz not null default now(),
  total_cost numeric not null default 0
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  movement_type text not null,     -- compra | preparacion | consumo_bebida | ajuste | merma | devolucion | correccion | transferencia
  quantity numeric not null,       -- + entra / - sale
  unit text not null,
  cost_amount numeric not null default 0,
  charter_id uuid references charters(id) on delete set null,
  recipe_id uuid references recipes(id) on delete set null,
  prepared_dish_id uuid references prepared_dishes(id) on delete set null,
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on stock_movements(product_id);
create index if not exists stock_movements_charter_idx on stock_movements(charter_id);

create table if not exists settings (
  id int primary key default 1,
  currency text not null default 'USD',
  allow_negative_stock boolean not null default false,
  expiry_warning_days int not null default 5,
  constraint settings_single_row check (id = 1)
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- =========================================================
-- RPCs atómicas
-- =========================================================

-- Compra con costo promedio ponderado (transaccional).
create or replace function register_purchase(
  p_date date,
  p_supplier text,
  p_notes text,
  p_items jsonb  -- [{product_id, quantity, unit, total_price}]
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_purchase_id uuid;
  v_item jsonb;
  v_prod products%rowtype;
  v_qty numeric; v_total numeric; v_unit_price numeric; v_sum numeric := 0;
begin
  if not can_write() then raise exception 'No autorizado'; end if;

  insert into purchases(date, supplier, notes, total_amount, created_by)
  values (p_date, p_supplier, p_notes, 0, auth.uid()::text)
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_prod from products where id = (v_item->>'product_id')::uuid for update;
    if not found then continue; end if;
    v_qty := (v_item->>'quantity')::numeric;
    v_total := (v_item->>'total_price')::numeric;
    v_unit_price := case when v_qty > 0 then v_total / v_qty else 0 end;
    v_sum := v_sum + v_total;

    update products set
      average_unit_cost = case when (current_quantity + v_qty) > 0
        then (greatest(current_quantity,0) * average_unit_cost + v_qty * v_unit_price) / (current_quantity + v_qty)
        else v_unit_price end,
      current_quantity = current_quantity + v_qty,
      updated_at = now()
    where id = v_prod.id;

    insert into purchase_items(purchase_id, product_id, quantity, unit, total_price, unit_price)
    values (v_purchase_id, v_prod.id, v_qty, v_item->>'unit', v_total, v_unit_price);

    insert into stock_movements(product_id, movement_type, quantity, unit, cost_amount, notes, created_by)
    values (v_prod.id, 'compra', v_qty, v_item->>'unit', v_total,
            coalesce('Compra a ' || p_supplier, 'Compra'), auth.uid()::text);
  end loop;

  update purchases set total_amount = v_sum where id = v_purchase_id;
  return v_purchase_id;
end;
$$;

-- Preparación de plato con descuento por receta (transaccional).
create or replace function prepare_dish(
  p_recipe_id uuid,
  p_servings numeric,
  p_charter_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_recipe recipes%rowtype;
  v_allow boolean;
  v_item recipe_items%rowtype;
  v_prod products%rowtype;
  v_needed numeric; v_cost numeric; v_total numeric := 0;
  v_pd_id uuid;
begin
  if not can_write() then raise exception 'No autorizado'; end if;
  select * into v_recipe from recipes where id = p_recipe_id;
  if not found then raise exception 'Receta inexistente'; end if;
  select allow_negative_stock into v_allow from settings where id = 1;

  -- Chequeo de stock
  if not v_allow then
    for v_item in select * from recipe_items where recipe_id = p_recipe_id loop
      select * into v_prod from products where id = v_item.product_id;
      if v_prod.current_quantity < v_item.quantity_per_serving * p_servings then
        raise exception 'Stock insuficiente de %', v_prod.name;
      end if;
    end loop;
  end if;

  insert into prepared_dishes(recipe_id, recipe_name, servings, charter_id, prepared_by, total_cost)
  values (p_recipe_id, v_recipe.name, p_servings, p_charter_id, auth.uid()::text, 0)
  returning id into v_pd_id;

  for v_item in select * from recipe_items where recipe_id = p_recipe_id loop
    select * into v_prod from products where id = v_item.product_id for update;
    v_needed := v_item.quantity_per_serving * p_servings;
    v_cost := v_needed * v_prod.average_unit_cost;
    v_total := v_total + v_cost;

    update products set current_quantity = current_quantity - v_needed, updated_at = now()
    where id = v_prod.id;

    insert into stock_movements(product_id, movement_type, quantity, unit, cost_amount, charter_id, recipe_id, prepared_dish_id, notes, created_by)
    values (v_prod.id, 'preparacion', -v_needed, v_item.unit, v_cost, p_charter_id, p_recipe_id, v_pd_id,
            p_servings || ' porción(es) de ' || v_recipe.name, auth.uid()::text);
  end loop;

  update prepared_dishes set total_cost = v_total where id = v_pd_id;
  return v_pd_id;
end;
$$;

-- =========================================================
-- RLS
-- =========================================================
alter table profiles enable row level security;
alter table products enable row level security;
alter table recipes enable row level security;
alter table recipe_items enable row level security;
alter table charters enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table prepared_dishes enable row level security;
alter table stock_movements enable row level security;
alter table settings enable row level security;

-- Perfiles: cada uno ve el suyo; admin ve todos.
create policy profiles_self on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_admin_update on profiles for update using (is_admin());

-- Lectura: cualquier usuario autenticado puede leer el dominio.
do $$
declare t text;
begin
  foreach t in array array['products','recipes','recipe_items','charters','purchases','purchase_items','prepared_dishes','stock_movements','settings']
  loop
    execute format('create policy %I_read on %I for select using (auth.role() = ''authenticated'');', t, t);
  end loop;
end $$;

-- Escritura directa: admin en todo; cocinero puede insertar movimientos/platos/actualizar productos.
create policy products_admin_write on products for all using (is_admin()) with check (is_admin());
create policy products_op_update on products for update using (can_write()) with check (can_write());
create policy recipes_admin_write on recipes for all using (is_admin()) with check (is_admin());
create policy recipe_items_admin_write on recipe_items for all using (is_admin()) with check (is_admin());
create policy charters_admin_write on charters for all using (is_admin()) with check (is_admin());
create policy charters_op_active on charters for update using (can_write()) with check (can_write());
create policy purchases_write on purchases for all using (can_write()) with check (can_write());
create policy purchase_items_write on purchase_items for all using (can_write()) with check (can_write());
create policy prepared_write on prepared_dishes for all using (can_write()) with check (can_write());
create policy movements_write on stock_movements for all using (can_write()) with check (can_write());
create policy settings_admin_write on settings for all using (is_admin()) with check (is_admin());

-- =========================================================
-- Datos demo mínimos (opcional: podés borrar esta sección)
-- =========================================================
insert into products (name, category, unit, current_quantity, average_unit_cost, minimum_quantity, critical_quantity, location)
values
  ('Pescado (filet)', 'pescados', 'g', 6000, 0.012, 3000, 1500, 'freezer'),
  ('Papa', 'verduras', 'g', 12000, 0.0015, 5000, 2000, 'deposito'),
  ('Aceite', 'condimentos', 'ml', 4000, 0.004, 1500, 800, 'cocina'),
  ('Sal', 'condimentos', 'g', 2000, 0.0008, 800, 300, 'cocina'),
  ('Limón', 'frutas', 'unidad', 24, 0.25, 12, 6, 'heladera'),
  ('Cerveza', 'bebidas', 'lata', 18, 1.3, 12, 6, 'heladera'),
  ('Agua', 'bebidas', 'botella', 24, 0.5, 12, 6, 'bar')
on conflict do nothing;
