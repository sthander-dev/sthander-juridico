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
