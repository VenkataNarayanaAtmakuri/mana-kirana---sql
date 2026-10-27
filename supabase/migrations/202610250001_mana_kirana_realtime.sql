-- Mana Kirana live backend: public catalogue, phone accounts, secure order RPCs,
-- per-account order messages, and Realtime publication.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'customer' check (role in ('customer', 'shopkeeper')),
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
drop index if exists public.categories_name_ci_unique;
create unique index categories_name_ci_unique on public.categories (lower(name)) where active;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id),
  name text not null,
  local text not null default '',
  price numeric(12,2) not null check (price > 0),
  unit text not null,
  step numeric(12,3) not null default 1 check (step > 0),
  stock numeric(12,3) not null default 0 check (stock >= 0),
  emoji text not null default '🛍️',
  tint text not null default 'new',
  note text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop index if exists public.products_name_ci_unique;
create unique index products_name_ci_unique on public.products (lower(name)) where active;
create index if not exists products_active_category_idx on public.products (category_id) where active;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  customer_id uuid not null references auth.users(id),
  customer_name text not null,
  customer_phone text not null,
  channel text not null check (channel in ('online', 'entrance')),
  status text not null default 'pending' check (status in ('pending', 'preparing', 'ready', 'collected', 'rejected')),
  payment_method text not null check (payment_method in ('pickup', 'upi_demo')),
  total numeric(12,2) not null check (total > 200),
  estimated_ready_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index if not exists orders_queue_idx on public.orders (estimated_ready_at) where status in ('pending', 'preparing');

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  item_name text not null,
  emoji text not null default '🛍️',
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null,
  price numeric(12,2) check (price is null or price >= 0),
  line_total numeric(12,2) check (line_total is null or line_total >= 0),
  custom_request boolean not null default false,
  price_confirmed boolean not null default true,
  created_at timestamptz not null default now(),
  check (not custom_request or (product_id is null and (price is null or price_confirmed)))
);
create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists customer_messages_user_created_idx on public.customer_messages (customer_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at before update on public.products
for each row execute function public.touch_updated_at();
drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at before update on public.orders
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_shopkeeper()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'shopkeeper'
  );
$$;
revoke all on function public.is_shopkeeper() from public, anon;
grant execute on function public.is_shopkeeper() to authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.customer_messages enable row level security;

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile" on public.profiles
for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "Active categories are public" on public.categories;
create policy "Active categories are public" on public.categories
for select to anon, authenticated using (active);
drop policy if exists "Shopkeepers add categories" on public.categories;
create policy "Shopkeepers add categories" on public.categories
for insert to authenticated with check ((select public.is_shopkeeper()));

drop policy if exists "Active products are public" on public.products;
create policy "Active products are public" on public.products
for select to anon, authenticated using (active);
drop policy if exists "Shopkeepers add products" on public.products;
create policy "Shopkeepers add products" on public.products
for insert to authenticated with check ((select public.is_shopkeeper()));
drop policy if exists "Shopkeepers edit products" on public.products;
create policy "Shopkeepers edit products" on public.products
for update to authenticated using ((select public.is_shopkeeper())) with check ((select public.is_shopkeeper()));

drop policy if exists "Customers and shopkeepers read relevant orders" on public.orders;
create policy "Customers and shopkeepers read relevant orders" on public.orders
for select to authenticated using (customer_id = (select auth.uid()) or (select public.is_shopkeeper()));

drop policy if exists "Customers and shopkeepers read order items" on public.order_items;
create policy "Customers and shopkeepers read order items" on public.order_items
for select to authenticated using (
  exists (
    select 1 from public.orders o where o.id = order_id
      and (o.customer_id = (select auth.uid()) or (select public.is_shopkeeper()))
  )
);

drop policy if exists "Customers read their messages" on public.customer_messages;
create policy "Customers read their messages" on public.customer_messages
for select to authenticated using (customer_id = (select auth.uid()));
drop policy if exists "Customers mark their messages read" on public.customer_messages;
create policy "Customers mark their messages read" on public.customer_messages
for update to authenticated using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));

grant select on public.categories, public.products to anon, authenticated;
grant insert on public.categories to authenticated;
grant insert, update on public.products to authenticated;
grant select on public.profiles, public.orders, public.order_items, public.customer_messages to authenticated;
grant update (read_at) on public.customer_messages to authenticated;

create or replace function public.remove_category(p_category_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_fallback_name text;
  v_fallback_id uuid;
  v_moved integer;
begin
  if not public.is_shopkeeper() then raise exception 'Shopkeeper access required'; end if;
  select c.name into v_name from public.categories c where c.id = p_category_id and c.active for update;
  if v_name is null then raise exception 'Category not found'; end if;
  select count(*) into v_moved from public.products p where p.category_id = p_category_id and p.active;
  if v_moved > 0 then
    v_fallback_name := case when lower(v_name) = 'other' then 'Uncategorized' else 'Other' end;
    select c.id into v_fallback_id from public.categories c where lower(c.name) = lower(v_fallback_name) and c.active;
    if v_fallback_id is null then
      insert into public.categories (name) values (v_fallback_name) returning id into v_fallback_id;
    end if;
    update public.products set category_id = v_fallback_id where category_id = p_category_id and active;
  end if;
  update public.categories set active = false where id = p_category_id;
  return jsonb_build_object('name', v_name, 'moved_products', v_moved, 'fallback', v_fallback_name);
end;
$$;

create or replace function public.place_order(
  p_customer_name text,
  p_confirmed_phone text,
  p_channel text,
  p_payment_method text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_auth_phone text;
  v_confirmed_digits text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_line_total numeric(12,2);
  v_total numeric(12,2) := 0;
  v_quantity numeric(12,3);
  v_order_id uuid;
  v_order_number bigint;
  v_ready_at timestamptz;
  v_has_custom boolean := false;
begin
  if v_user_id is null then raise exception 'Sign in with a verified mobile number first'; end if;
  if length(trim(coalesce(p_customer_name, ''))) < 2 then raise exception 'Enter your name'; end if;
  if p_channel not in ('online', 'entrance') then raise exception 'Invalid order channel'; end if;
  if p_payment_method not in ('pickup', 'upi_demo') then raise exception 'Invalid payment method'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item'; end if;

  select u.phone into v_auth_phone from auth.users u where u.id = v_user_id and u.phone_confirmed_at is not null;
  v_confirmed_digits := regexp_replace(coalesce(p_confirmed_phone, ''), '\D', '', 'g');
  if v_auth_phone is null or length(v_confirmed_digits) <> 10
    or right(regexp_replace(v_auth_phone, '\D', '', 'g'), 10) <> v_confirmed_digits then
    raise exception 'The confirmed mobile number must match your verified account';
  end if;

  for v_item in
    select e.value from jsonb_array_elements(p_items) as e(value)
    order by coalesce(e.value ->> 'product_id', ''), coalesce(e.value ->> 'name', '')
  loop
    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_quantity <= 0 then raise exception 'Every item needs a positive quantity'; end if;
    if coalesce((v_item ->> 'custom')::boolean, false) then
      v_has_custom := true;
      if length(trim(coalesce(v_item ->> 'name', ''))) < 1 or length(v_item ->> 'name') > 120 then raise exception 'Enter a valid requested item name'; end if;
      if coalesce(v_item ->> 'unit', '') not in ('kg', 'piece', 'pack', 'litre') then raise exception 'Invalid requested item unit'; end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', null, 'name', trim(v_item ->> 'name'), 'emoji', '📝',
        'quantity', v_quantity, 'unit', v_item ->> 'unit', 'price', null,
        'line_total', null, 'custom', true, 'price_confirmed', false
      ));
    else
      select p.* into v_product from public.products p
      where p.id = (v_item ->> 'product_id')::uuid and p.active
      for update;
      if not found then raise exception 'A selected product is no longer available'; end if;
      if v_product.stock < v_quantity then raise exception 'Not enough stock for %', v_product.name; end if;
      v_line_total := round(v_product.price * v_quantity, 2);
      v_total := v_total + v_line_total;
      update public.products set stock = stock - v_quantity where id = v_product.id;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', v_product.id, 'name', v_product.name, 'emoji', v_product.emoji,
        'quantity', v_quantity, 'unit', v_product.unit, 'price', v_product.price,
        'line_total', v_line_total, 'custom', false, 'price_confirmed', true
      ));
    end if;
  end loop;

  if v_total <= 200 then raise exception 'The confirmed item subtotal must be more than ₹200'; end if;
  if v_has_custom and p_payment_method <> 'pickup' then raise exception 'Requested items are settled at pickup'; end if;

  -- Serialize queue allocation so two simultaneous checkouts cannot get the same slot.
  perform pg_advisory_xact_lock(hashtext('mana-kirana-pickup-queue'));
  select greatest(coalesce(max(o.estimated_ready_at), now()), now()) + interval '15 minutes'
    into v_ready_at
    from public.orders o where o.status in ('pending', 'preparing');

  insert into public.orders (customer_id, customer_name, customer_phone, channel, payment_method, total, estimated_ready_at)
  values (v_user_id, trim(p_customer_name), v_auth_phone, p_channel, p_payment_method, v_total, v_ready_at)
  returning id, order_number into v_order_id, v_order_number;

  insert into public.order_items (order_id, product_id, item_name, emoji, quantity, unit, price, line_total, custom_request, price_confirmed)
  select v_order_id,
         nullif(x.value ->> 'product_id', '')::uuid,
         x.value ->> 'name', x.value ->> 'emoji', (x.value ->> 'quantity')::numeric,
         x.value ->> 'unit', nullif(x.value ->> 'price', 'null')::numeric,
         nullif(x.value ->> 'line_total', 'null')::numeric,
         (x.value ->> 'custom')::boolean, (x.value ->> 'price_confirmed')::boolean
  from jsonb_array_elements(v_lines) as x(value);

  insert into public.customer_messages (customer_id, order_id, body)
  values (v_user_id, v_order_id, 'Your order is received and is expected to be ready by ' || to_char(v_ready_at at time zone 'Asia/Kolkata', 'Dy, DD Mon at HH12:MI AM') || '.');

  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number, 'total', v_total, 'estimated_ready_at', v_ready_at);
end;
$$;

create or replace function public.update_order_status(p_order_id uuid, p_next_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_body text;
begin
  if not public.is_shopkeeper() then raise exception 'Shopkeeper access required'; end if;
  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not (
    (v_order.status = 'pending' and p_next_status in ('preparing', 'rejected')) or
    (v_order.status = 'preparing' and p_next_status = 'ready') or
    (v_order.status = 'ready' and p_next_status = 'collected')
  ) then raise exception 'Invalid order status transition'; end if;

  if p_next_status = 'rejected' then
    update public.products p set stock = p.stock + i.quantity
    from public.order_items i where i.order_id = v_order.id and i.product_id = p.id and not i.custom_request;
    v_body := 'The shop declined order MK-' || lpad(v_order.order_number::text, 6, '0') || '. Any reserved catalogue stock has been released.';
  elsif p_next_status = 'preparing' then
    v_body := 'The shop accepted order MK-' || lpad(v_order.order_number::text, 6, '0') || ' and has started preparing it.';
  elsif p_next_status = 'ready' then
    v_body := 'Order MK-' || lpad(v_order.order_number::text, 6, '0') || ' is ready for pickup.';
  else
    v_body := 'Order MK-' || lpad(v_order.order_number::text, 6, '0') || ' was marked collected. Thank you.';
  end if;

  update public.orders set status = p_next_status where id = v_order.id;
  insert into public.customer_messages (customer_id, order_id, body) values (v_order.customer_id, v_order.id, v_body);
end;
$$;

create or replace function public.set_requested_item_price(p_order_item_id uuid, p_rate numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_total numeric(12,2);
begin
  if not public.is_shopkeeper() then raise exception 'Shopkeeper access required'; end if;
  if p_rate is null or p_rate <= 0 then raise exception 'Rate must be greater than zero'; end if;
  select i.* into v_item from public.order_items i where i.id = p_order_item_id for update;
  if not found or not v_item.custom_request then raise exception 'Unpriced request not found'; end if;
  select o.* into v_order from public.orders o where o.id = v_item.order_id for update;
  if v_order.status in ('rejected', 'collected') then raise exception 'This order is closed'; end if;
  update public.order_items set price = p_rate, line_total = round(p_rate * quantity, 2), price_confirmed = true where id = v_item.id;
  select coalesce(sum(i.line_total), 0) into v_total from public.order_items i where i.order_id = v_order.id;
  update public.orders set total = v_total where id = v_order.id;
  insert into public.customer_messages (customer_id, order_id, body)
  values (v_order.customer_id, v_order.id, 'The shop set a rate for ' || v_item.item_name || '. Your updated order total is ₹' || v_total::text || '.');
  return v_total;
end;
$$;

revoke all on function public.remove_category(uuid) from public, anon;
revoke all on function public.place_order(text, text, text, text, jsonb) from public, anon;
revoke all on function public.update_order_status(uuid, text) from public, anon;
revoke all on function public.set_requested_item_price(uuid, numeric) from public, anon;
grant execute on function public.remove_category(uuid) to authenticated;
grant execute on function public.place_order(text, text, text, text, jsonb) to authenticated;
grant execute on function public.update_order_status(uuid, text) to authenticated;
grant execute on function public.set_requested_item_price(uuid, numeric) to authenticated;

insert into public.categories (name) values ('Fresh'), ('Staples'), ('Dairy'), ('Snacks') on conflict do nothing;
insert into public.products (name, local, category_id, price, unit, step, stock, emoji, tint, note)
select seed.name, seed.local, c.id, seed.price, seed.unit, seed.step, seed.stock, seed.emoji, seed.tint, seed.note
from (values
  ('Farm tomatoes','తాజా టమాటాలు','Fresh',36,'kg',0.25,18,'🍅','tomato','Ripe & juicy'),
  ('Potatoes','బంగాళాదుంపలు','Fresh',32,'kg',0.5,22,'🥔','potato','Everyday essential'),
  ('Red onions','ఎర్ర ఉల్లిపాయలు','Fresh',42,'kg',0.5,14,'🧅','onion','Locally sourced'),
  ('Robusta bananas','అరటిపండ్లు','Fresh',48,'dozen',1,12,'🍌','banana','Naturally sweet'),
  ('Sona masoori rice','సోనా మసూరి బియ్యం','Staples',68,'kg',0.5,35,'🍚','rice','Loose · polished'),
  ('Toor dal','కందిపప్పు','Staples',158,'kg',0.25,11,'🫘','dal','Loose · unpolished'),
  ('Whole wheat atta','గోధుమ పిండి','Staples',54,'kg',0.5,16,'🌾','atta','Freshly milled'),
  ('Red chilli powder','కారం పొడి','Staples',32,'100 g',1,24,'🌶️','chilli','Small batch ground'),
  ('Fresh cow milk','తాజా పాలు','Dairy',34,'500 ml',1,20,'🥛','milk','Today’s morning batch'),
  ('Thick set curd','పెరుగు','Dairy',38,'500 g',1,14,'🥣','curd','Made fresh today'),
  ('Malai paneer','పనీర్','Dairy',92,'200 g',1,8,'🧀','paneer','Soft & creamy'),
  ('Homestyle murukku','మురుకులు','Snacks',55,'pack',1,18,'🥨','snack','A little tea-time joy')
) as seed(name, local, category, price, unit, step, stock, emoji, tint, note)
join public.categories c on c.name = seed.category and c.active
on conflict do nothing;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories') then alter publication supabase_realtime add table public.categories; end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products') then alter publication supabase_realtime add table public.products; end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then alter publication supabase_realtime add table public.orders; end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items') then alter publication supabase_realtime add table public.order_items; end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customer_messages') then alter publication supabase_realtime add table public.customer_messages; end if;
  end if;
end;
$$;
