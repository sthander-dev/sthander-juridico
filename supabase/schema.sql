create extension if not exists "pgcrypto";

create type public.subscription_status as enum ('trial','active','overdue','suspended','cancelled');
create type public.office_role as enum ('owner','lawyer','assistant','finance');

create table public.offices (
  id uuid primary key default gen_random_uuid(), legal_name text not null, trade_name text, cnpj text unique,
  contact_email text not null, contact_phone text, oab_responsible text,
  status public.subscription_status not null default 'trial', created_at timestamptz not null default now()
);
create table public.office_members (
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.office_role not null default 'lawyer', active boolean not null default true,
  primary key (office_id,user_id)
);
create table public.lawyers (
  id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id) on delete cascade,
  full_name text not null, cpf text, oab_number text not null, oab_uf char(2) not null,
  email text not null, phone text, practice_areas text[] not null default '{}', active boolean not null default true,
  accepts_auto_assignment boolean not null default true, current_workload integer not null default 0, created_at timestamptz not null default now(),
  unique(office_id,oab_number,oab_uf)
);
create table public.plans (id uuid primary key default gen_random_uuid(), name text not null unique, monthly_amount numeric(12,2) not null, active boolean not null default true);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(), office_id uuid not null unique references public.offices(id) on delete cascade,
  plan_id uuid references public.plans(id), amount numeric(12,2) not null, due_day smallint not null check (due_day between 1 and 28),
  status public.subscription_status not null default 'trial', starts_at date not null default current_date, ends_at date, created_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  due_date date not null, paid_at timestamptz, amount numeric(12,2) not null, status text not null default 'pending', provider_reference text, created_at timestamptz not null default now()
);
create table public.clients (
  id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id) on delete cascade,
  kind text not null check(kind in ('person','company')), name text not null, document text, email text, phone text,
  address jsonb not null default '{}'::jsonb, notes text, created_at timestamptz not null default now()
);
create table public.matters (
  id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null, process_number text, court text, instance text,
  area text, subject text not null, status text not null default 'open', opened_at date, created_at timestamptz not null default now()
);
create table public.matter_lawyers (
  matter_id uuid not null references public.matters(id) on delete cascade, lawyer_id uuid not null references public.lawyers(id) on delete cascade,
  role text not null default 'responsible' check(role in ('responsible','co_responsible')), assigned_at timestamptz not null default now(), assigned_by uuid references auth.users(id), primary key(matter_id,lawyer_id)
);
create table public.deadlines (
  id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id) on delete cascade,
  matter_id uuid references public.matters(id) on delete cascade, title text not null, due_at timestamptz not null, done_at timestamptz, created_at timestamptz not null default now()
);

alter table public.offices enable row level security; alter table public.office_members enable row level security; alter table public.clients enable row level security; alter table public.matters enable row level security; alter table public.deadlines enable row level security;
create function public.is_master() returns boolean language sql stable security definer set search_path = public as $$ select coalesce((auth.jwt()->'app_metadata'->>'role') = 'master', false) $$;
create function public.in_office(target uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from public.office_members where office_id=target and user_id=auth.uid() and active) $$;
create policy master_offices on public.offices for all using (public.is_master()) with check (public.is_master());
create policy member_offices on public.offices for select using (public.in_office(id));
create policy master_members on public.office_members for all using (public.is_master()) with check (public.is_master());
create policy office_clients on public.clients for all using (public.is_master() or public.in_office(office_id)) with check (public.is_master() or public.in_office(office_id));
create policy office_matters on public.matters for all using (public.is_master() or public.in_office(office_id)) with check (public.is_master() or public.in_office(office_id));
create policy office_deadlines on public.deadlines for all using (public.is_master() or public.in_office(office_id)) with check (public.is_master() or public.in_office(office_id));


-- Office and subscription administration (also kept as a repeatable migration).
alter table public.offices
  add column if not exists responsible_name text;

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

drop policy if exists master_plans_read on public.plans;
create policy master_plans_read on public.plans
  for select using (public.is_master());

drop policy if exists master_subscriptions_read on public.subscriptions;
create policy master_subscriptions_read on public.subscriptions
  for select using (public.is_master());

drop policy if exists master_payments_read on public.payments;
create policy master_payments_read on public.payments
  for select using (public.is_master());

create or replace function public.create_office_with_subscription(
  p_legal_name text,
  p_contact_email text,
  p_plan_name text,
  p_amount numeric,
  p_due_day smallint,
  p_status public.subscription_status,
  p_cnpj text default null,
  p_responsible_name text default null,
  p_oab_responsible text default null,
  p_contact_phone text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_office_id uuid;
  selected_plan_id uuid;
begin
  if not public.is_master() then
    raise exception 'Apenas o usuário master pode cadastrar escritórios.' using errcode = '42501';
  end if;

  if nullif(trim(p_legal_name), '') is null
     or nullif(trim(p_contact_email), '') is null
     or p_plan_name not in ('Essencial', 'Profissional', 'Corporativo')
     or p_amount < 0
     or p_due_day not between 1 and 28 then
    raise exception 'Confira os dados obrigatórios do escritório e da assinatura.' using errcode = '22023';
  end if;

  insert into public.plans (name, monthly_amount)
  values (p_plan_name, p_amount)
  on conflict (name) do nothing
  returning id into selected_plan_id;

  if selected_plan_id is null then
    select id into selected_plan_id from public.plans where name = p_plan_name;
  end if;

  insert into public.offices (
    legal_name, cnpj, responsible_name, oab_responsible,
    contact_email, contact_phone, status
  ) values (
    trim(p_legal_name), nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), ''),
    nullif(trim(coalesce(p_responsible_name, '')), ''), nullif(trim(coalesce(p_oab_responsible, '')), ''),
    lower(trim(p_contact_email)), nullif(trim(coalesce(p_contact_phone, '')), ''), p_status
  ) returning id into new_office_id;

  insert into public.subscriptions (office_id, plan_id, amount, due_day, status)
  values (new_office_id, selected_plan_id, p_amount, p_due_day, p_status);

  return new_office_id;
end;
$$;

revoke all on function public.create_office_with_subscription(
  text, text, text, numeric, smallint, public.subscription_status,
  text, text, text, text
) from public;
grant execute on function public.create_office_with_subscription(
  text, text, text, numeric, smallint, public.subscription_status,
  text, text, text, text
) to authenticated;
