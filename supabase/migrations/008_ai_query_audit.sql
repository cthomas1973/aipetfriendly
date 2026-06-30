-- Auditoria de consultas IA y metricas para admin

create table if not exists public.ai_query_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  tier text not null check (tier in ('guest', 'free', 'premium')),
  model text,
  question_chars integer not null default 0 check (question_chars >= 0),
  answer_chars integer not null default 0 check (answer_chars >= 0),
  estimated_prompt_tokens integer not null default 0 check (estimated_prompt_tokens >= 0),
  estimated_completion_tokens integer not null default 0 check (estimated_completion_tokens >= 0),
  estimated_total_tokens integer not null default 0 check (estimated_total_tokens >= 0),
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_ai_query_logs_created_at on public.ai_query_logs(created_at desc);
create index if not exists idx_ai_query_logs_user_id on public.ai_query_logs(user_id);
create index if not exists idx_ai_query_logs_pet_id on public.ai_query_logs(pet_id);

alter table public.ai_query_logs enable row level security;

drop policy if exists "Users can view own ai query logs" on public.ai_query_logs;
create policy "Users can view own ai query logs" on public.ai_query_logs
  for select using (auth.uid() = user_id);

create or replace function public.admin_list_ai_query_audit(p_limit integer default 50)
returns table (
  created_at timestamp with time zone,
  user_email text,
  pet_name text,
  tier text,
  model text,
  estimated_total_tokens integer,
  question_chars integer,
  answer_chars integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    l.created_at,
    u.email as user_email,
    p.name as pet_name,
    l.tier,
    l.model,
    l.estimated_total_tokens,
    l.question_chars,
    l.answer_chars
  from public.ai_query_logs l
  join public.users u on u.id = l.user_id
  join public.pets p on p.id = l.pet_id
  order by l.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);
end;
$$;

create or replace function public.admin_get_ai_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today bigint := 0;
  v_last_7d bigint := 0;
  v_tokens_7d bigint := 0;
  v_total_pets bigint := 0;
  v_exhausted_pets bigint := 0;
  v_top_pets jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  select count(*)
    into v_today
  from public.ai_query_logs
  where created_at::date = current_date;

  select count(*), coalesce(sum(estimated_total_tokens), 0)
    into v_last_7d, v_tokens_7d
  from public.ai_query_logs
  where created_at >= now() - interval '7 days';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'petName', t.pet_name,
        'count', t.total_queries
      )
      order by t.total_queries desc
    ),
    '[]'::jsonb
  )
    into v_top_pets
  from (
    select
      p.name as pet_name,
      count(*)::bigint as total_queries
    from public.ai_query_logs l
    join public.pets p on p.id = l.pet_id
    where l.created_at >= now() - interval '30 days'
    group by p.name
    order by total_queries desc
    limit 5
  ) t;

  with settings as (
    select guest_limit_per_pet, free_limit_per_pet, premium_limit_per_pet
    from public.ai_usage_settings
    where singleton = true
    limit 1
  ), pets_with_limit as (
    select
      p.id as pet_id,
      coalesce(apu.usage_count, 0) as used,
      case
        when u.access_mode = 'premium' then s.premium_limit_per_pet
        when u.access_mode = 'guest' then s.guest_limit_per_pet
        else s.free_limit_per_pet
      end as limit_per_pet
    from public.pets p
    join public.users u on u.id = p.user_id
    cross join settings s
    left join public.ai_pet_usage apu on apu.user_id = p.user_id and apu.pet_id = p.id
  )
  select
    count(*)::bigint,
    count(*) filter (where used >= limit_per_pet and limit_per_pet > 0)::bigint
  into v_total_pets, v_exhausted_pets
  from pets_with_limit;

  return jsonb_build_object(
    'consultasHoy', v_today,
    'consultas7d', v_last_7d,
    'tokens7d', v_tokens_7d,
    'topMascotas', v_top_pets,
    'percentLimitesAgotados',
      case
        when v_total_pets = 0 then 0
        else round((v_exhausted_pets::numeric * 100.0) / v_total_pets::numeric, 1)
      end
  );
end;
$$;

grant execute on function public.admin_list_ai_query_audit(integer) to authenticated;
grant execute on function public.admin_get_ai_dashboard_metrics() to authenticated;
