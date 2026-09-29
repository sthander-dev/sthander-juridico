-- Administer offices and subscriptions using the schema already present in the
-- sthander-juridico Supabase project (status columns are text there).
create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt()->'app_metadata'->>'role') = 'master', false)
$$;

alter table public.offices add column if not exists responsible_name text;
alter table public.offices enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

create policy master_offices on public.offices
  for all using (public.is_master()) with check (public.is_master());
create policy master_plans_read on public.plans
  for select using (public.is_master());
create policy master_subscriptions_read on public.subscriptions
  for select using (public.is_master());
create policy master_payments_read on public.payments
  for select using (public.is_master());

create or replace function public.create_office_with_subscription(
  p_legal_name text,
  p_contact_email text,
  p_plan_name text,
  p_amount numeric,
  p_due_day smallint,
  p_status text,
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
     or p_due_day not between 1 and 28
     or p_status not in ('trial', 'active', 'overdue', 'suspended', 'cancelled') then
    raise exception 'Confira os dados obrigatórios do escritório e da assinatura.' using errcode = '22023';
  end if;

  select id into selected_plan_id from public.plans where name = p_plan_name limit 1;
  if selected_plan_id is null then
    insert into public.plans (name, monthly_amount)
    values (p_plan_name, p_amount)
    returning id into selected_plan_id;
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

revoke all on function public.create_office_with_subscription(text,text,text,numeric,smallint,text,text,text,text,text) from public, anon;
grant execute on function public.create_office_with_subscription(text,text,text,numeric,smallint,text,text,text,text,text) to authenticated;
