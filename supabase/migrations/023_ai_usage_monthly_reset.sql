-- Reinicio mensual del consumo de consultas IA por mascota
-- El contador usage_count solo es valido para el mes indicado en period_key ('YYYY-MM').
-- Al cambiar de mes, el consumo se considera 0 sin necesidad de un job de limpieza.

alter table public.ai_pet_usage
  add column if not exists period_key text not null default to_char(now(), 'YYYY-MM');

update public.ai_pet_usage
  set period_key = to_char(coalesce(updated_at, now()), 'YYYY-MM')
  where period_key is null;

create or replace function public.get_user_pet_ai_usage()
returns table (
  pet_id uuid,
  usage_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.pet_id, u.usage_count
  from public.ai_pet_usage u
  where u.user_id = auth.uid()
    and u.period_key = to_char(now(), 'YYYY-MM');
end;
$$;

grant execute on function public.get_user_pet_ai_usage() to authenticated;

-- Metricas admin: solo contar consumo del mes en curso como "usado".
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
      case
        when apu.period_key = to_char(now(), 'YYYY-MM') then coalesce(apu.usage_count, 0)
        else 0
      end as used,
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

grant execute on function public.admin_get_ai_dashboard_metrics() to authenticated;
