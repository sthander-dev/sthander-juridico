-- Keep office mutation functions unavailable to anonymous API requests.
revoke all on function public.create_office_with_subscription(text,text,text,numeric,smallint,text,text,text,text,text) from public, anon;
grant execute on function public.create_office_with_subscription(text,text,text,numeric,smallint,text,text,text,text,text) to authenticated;

-- Allow only master accounts to edit office details and their linked plan.
create or replace function public.update_office_with_subscription(
  p_office_id uuid,
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
  selected_plan_id uuid;
begin
  if not public.is_master() then
    raise exception 'Apenas o usuário master pode editar escritórios.' using errcode = '42501';
  end if;

  if p_office_id is null
     or nullif(trim(p_legal_name), '') is null
     or nullif(trim(p_contact_email), '') is null
     or p_plan_name not in ('Essencial', 'Profissional', 'Corporativo')
     or p_amount < 0
     or p_due_day not between 1 and 28
     or p_status not in ('trial', 'active', 'overdue', 'suspended', 'cancelled') then
    raise exception 'Confira os dados obrigatórios do escritório e da assinatura.' using errcode = '22023';
  end if;

  update public.offices
  set legal_name = trim(p_legal_name),
      cnpj = nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), ''),
      responsible_name = nullif(trim(coalesce(p_responsible_name, '')), ''),
      oab_responsible = nullif(trim(coalesce(p_oab_responsible, '')), ''),
      contact_email = lower(trim(p_contact_email)),
      contact_phone = nullif(trim(coalesce(p_contact_phone, '')), ''),
      status = p_status
  where id = p_office_id;

  if not found then
    raise exception 'Escritório não encontrado.' using errcode = 'P0002';
  end if;

  select id into selected_plan_id from public.plans where name = p_plan_name limit 1;
  if selected_plan_id is null then
    insert into public.plans (name, monthly_amount)
    values (p_plan_name, p_amount)
    returning id into selected_plan_id;
  end if;

  update public.subscriptions
  set plan_id = selected_plan_id,
      amount = p_amount,
      due_day = p_due_day,
      status = p_status
  where office_id = p_office_id;

  if not found then
    insert into public.subscriptions (office_id, plan_id, amount, due_day, status)
    values (p_office_id, selected_plan_id, p_amount, p_due_day, p_status);
  end if;

  return p_office_id;
end;
$$;

revoke all on function public.update_office_with_subscription(uuid,text,text,text,numeric,smallint,text,text,text,text,text) from public, anon;
grant execute on function public.update_office_with_subscription(uuid,text,text,text,numeric,smallint,text,text,text,text,text) to authenticated;
