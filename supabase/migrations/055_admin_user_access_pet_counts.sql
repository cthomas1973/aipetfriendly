-- Suma la cantidad de mascotas registradas por usuario al listado admin de acceso,
-- para poder mostrar un resumen de usuarios/mascotas por plan en el panel admin.

drop function if exists public.admin_list_user_access();

create or replace function public.admin_list_user_access()
returns table (
  id uuid,
  email text,
  full_name text,
  access text,
  subscription_plan text,
  subscription_active boolean,
  created_at timestamp with time zone,
  pets_count bigint
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
    u.id,
    u.email,
    u.full_name,
    u.access_mode as access,
    coalesce(s.plan, 'free') as subscription_plan,
    coalesce(s.is_active, false) as subscription_active,
    u.created_at,
    coalesce(p.pets_count, 0) as pets_count
  from public.users u
  left join public.subscriptions s on s.user_id = u.id
  left join (
    select user_id, count(*) as pets_count
    from public.pets
    group by user_id
  ) p on p.user_id = u.id
  order by u.created_at desc;
end;
$$;

grant execute on function public.admin_list_user_access() to authenticated;
