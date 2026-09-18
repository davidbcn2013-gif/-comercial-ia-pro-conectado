-- Comercial IA PRO: esquema multiusuario para Supabase
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text,
  role text not null default 'commercial' check (role in ('admin','commercial')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_modules (
  user_id uuid references public.profiles(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default false,
  primary key (user_id,module_key)
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  sender text not null default 'David Salmerón',
  company text not null default '',
  logo text not null default '',
  cyc_email text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  contact text,
  phone text,
  email text,
  nif text,
  fiscal_name text,
  commercial_name text,
  address text,
  city text,
  province text,
  postal_code text,
  notes text,
  status text,
  potential numeric,
  next_action text,
  created_at timestamptz not null default now()
);

create table if not exists public.tariffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tariff_key text not null check (tariff_key in ('Fresco','X','XY','Z','W')),
  filename text,
  loaded_at timestamptz not null default now(),
  version integer not null default 1,
  is_active boolean not null default true
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tariff_id uuid references public.tariffs(id) on delete cascade,
  tariff_key text check (tariff_key in ('Fresco','X','XY','Z','W')),
  code text not null,
  name text not null,
  format text,
  price numeric not null,
  unit text,
  stock boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  tariffs text[] not null,
  created_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.cyc_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  amount numeric not null,
  nif text not null,
  contact_name text not null default '',
  phone text not null,
  fiscal_name text not null,
  commercial_name text not null,
  address text not null,
  city text not null,
  province text not null,
  postal_code text not null,
  created_at timestamptz not null default now(),
  status text not null default 'created'
);

alter table public.profiles enable row level security;
alter table public.user_modules enable row level security;
alter table public.user_settings enable row level security;
alter table public.clients enable row level security;
alter table public.tariffs enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.cyc_requests enable row level security;

-- Automatic profile/settings creation after Supabase Auth signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Usuario: solo sus propios datos.
create policy "profiles own select" on public.profiles for select using (auth.uid()=id);
create policy "modules own all" on public.user_modules for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "settings own all" on public.user_settings for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "clients own" on public.clients for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "tariffs own" on public.tariffs for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "products own" on public.products for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "offers own" on public.offers for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "cyc own" on public.cyc_requests for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- Admin helpers. Only profiles with role=admin can use them.
create or replace function public.admin_list_profiles()
returns setof public.profiles
language sql
security definer set search_path = public
as $$
  select p.* from public.profiles p
  where exists (select 1 from public.profiles me where me.id = auth.uid() and me.role='admin')
  order by p.created_at;
$$;

create or replace function public.admin_set_module(target_user uuid, key text, value boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'not authorized';
  end if;
  insert into public.user_modules(user_id,module_key,enabled)
  values(target_user,key,value)
  on conflict(user_id,module_key) do update set enabled=excluded.enabled;
end;
$$;
