-- Admin panel de acceso de usuarios (guest/free/premium)

alter table public.users
  add column if not exists access_mode text not null default 'free'
  check (access_mode in ('guest', 'free', 'premium'));

update public.users u
set access_mode = case
  when s.plan = 'premium' and coalesce(s.is_active, false) = true then 'premium'
  else 'free'
end
from public.subscriptions s
where s.user_id = u.id
  and (u.access_mode is null or u.access_mode not in ('guest', 'free', 'premium'));

create table if not exists public.admin_users (
  user_id uuid primary key references public.users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "Admin users can view own admin row" on public.admin_users;
create policy "Admin users can view own admin row" on public.admin_users
  for select using (auth.uid() = user_id);

create or replace function public.admin_list_user_access()
returns table (
  id uuid,
  email text,
  full_name text,
  access text,
  subscription_plan text,
  subscription_active boolean,
  created_at timestamp with time zone
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
    u.created_at
  from public.users u
  left join public.subscriptions s on s.user_id = u.id
  order by u.created_at desc;
end;
$$;

create or replace function public.admin_set_user_access(p_user_id uuid, p_access text)
returns void
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

  if p_access not in ('guest', 'free', 'premium') then
    raise exception 'Acceso invalido';
  end if;

  update public.users
  set access_mode = p_access,
      updated_at = now()
  where id = p_user_id;

  if p_access = 'guest' then
    insert into public.subscriptions (user_id, plan, is_active, updated_at)
    values (p_user_id, 'free', false, now())
    on conflict (user_id) do update
      set plan = 'free',
          is_active = false,
          updated_at = now();
  elsif p_access = 'free' then
    insert into public.subscriptions (user_id, plan, is_active, updated_at)
    values (p_user_id, 'free', true, now())
    on conflict (user_id) do update
      set plan = 'free',
          is_active = true,
          updated_at = now();
  else
    insert into public.subscriptions (user_id, plan, is_active, updated_at)
    values (p_user_id, 'premium', true, now())
    on conflict (user_id) do update
      set plan = 'premium',
          is_active = true,
          updated_at = now();
  end if;
end;
$$;

grant execute on function public.admin_list_user_access() to authenticated;
grant execute on function public.admin_set_user_access(uuid, text) to authenticated;
