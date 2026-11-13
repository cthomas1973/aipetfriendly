begin;

-- Keep profile edits on their existing client paths, but never let a client
-- write authorization state directly through public.users.
revoke update on table public.users from public, anon, authenticated;
grant update (
  full_name,
  avatar_url,
  updated_at,
  whatsapp_phone,
  whatsapp_opt_in,
  whatsapp_opt_in_at,
  whatsapp_opt_in_source,
  news_opt_in,
  news_opt_in_at,
  news_opt_in_source
) on table public.users to authenticated;

drop policy if exists "Users can insert their own profile" on public.users;
create policy "Users can insert their own profile"
  on public.users as permissive for insert to authenticated
  with check (auth.uid() = id and access_mode = 'free');

drop policy if exists "User profile insert guard" on public.users;
create policy "User profile insert guard"
  on public.users as restrictive for insert to public
  with check (
    auth.role() = 'service_role'
    or (auth.uid() = id and access_mode = 'free')
  );

create or replace function public.guard_user_access_mode()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.access_mode is distinct from old.access_mode
    and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'access_mode can only be changed by an authorized server operation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_user_access_mode on public.users;
create trigger trg_guard_user_access_mode
  before update of access_mode on public.users
  for each row execute function public.guard_user_access_mode();

revoke all on function public.guard_user_access_mode() from public, anon, authenticated;

-- Subscription rows are created by the client only during bootstrap. The
-- client may create a free/inactive row, but plan and activation changes are
-- reserved for the admin RPC or trusted server/service-role operations.
drop policy if exists "Users can insert their own subscription" on public.subscriptions;
create policy "Users can insert their own free subscription"
  on public.subscriptions as permissive for insert to authenticated
  with check (
    auth.uid() = user_id
    and plan = 'free'
    and coalesce(is_active, false) = false
  );

drop policy if exists "Users can update their own subscription" on public.subscriptions;
drop policy if exists "Subscription update guard" on public.subscriptions;
create policy "Subscription update guard"
  on public.subscriptions as restrictive for update to public
  using (false)
  with check (false);

drop policy if exists "Subscription insert guard" on public.subscriptions;
create policy "Subscription insert guard"
  on public.subscriptions as restrictive for insert to public
  with check (
    auth.role() = 'service_role'
    or (
      auth.uid() = user_id
      and plan = 'free'
      and coalesce(is_active, false) = false
    )
  );

drop policy if exists "Subscription delete guard" on public.subscriptions;
create policy "Subscription delete guard"
  on public.subscriptions as restrictive for delete to public
  using (false);

create or replace function public.guard_subscription_authorization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (new.plan <> 'free' or coalesce(new.is_active, false))
      and current_user not in ('postgres', 'service_role', 'supabase_admin') then
      raise exception 'subscription authorization can only be changed by a trusted server operation';
    end if;
  elsif (new.plan is distinct from old.plan or new.is_active is distinct from old.is_active)
    and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'subscription authorization can only be changed by a trusted server operation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_subscription_authorization on public.subscriptions;
create trigger trg_guard_subscription_authorization
  before insert or update of plan, is_active on public.subscriptions
  for each row execute function public.guard_subscription_authorization();

revoke all on function public.guard_subscription_authorization() from public, anon, authenticated;

drop policy if exists "Admin write beneficios productos" on public.beneficios_productos;

drop policy if exists "Admin insert beneficios productos" on public.beneficios_productos;
drop policy if exists "Admin update beneficios productos" on public.beneficios_productos;
drop policy if exists "Admin delete beneficios productos" on public.beneficios_productos;
drop policy if exists "Admin guard insert beneficios productos" on public.beneficios_productos;
drop policy if exists "Admin guard update beneficios productos" on public.beneficios_productos;
drop policy if exists "Admin guard delete beneficios productos" on public.beneficios_productos;

create policy "Admin insert beneficios productos"
  on public.beneficios_productos as permissive for insert to authenticated
  with check (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
    )
  );

create policy "Admin update beneficios productos"
  on public.beneficios_productos as permissive for update to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
    )
  );

create policy "Admin delete beneficios productos"
  on public.beneficios_productos as permissive for delete to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
    )
  );

create policy "Admin read all beneficios productos"
  on public.beneficios_productos as permissive for select to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
    )
  );

drop policy if exists "Public and admin guard read beneficios productos" on public.beneficios_productos;
create policy "Public and admin guard read beneficios productos"
  on public.beneficios_productos as restrictive for select to public
  using (
    active = true
    or exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
    )
  );

drop policy if exists "Block client insert admin users" on public.admin_users;
create policy "Block client insert admin users"
  on public.admin_users as restrictive for insert to public
  with check (false);

drop policy if exists "Block client update admin users" on public.admin_users;
create policy "Block client update admin users"
  on public.admin_users as restrictive for update to public
  using (false)
  with check (false);

drop policy if exists "Block client delete admin users" on public.admin_users;
create policy "Block client delete admin users"
  on public.admin_users as restrictive for delete to public
  using (false);

create policy "Admin guard insert beneficios productos"
  on public.beneficios_productos as restrictive for insert to public
  with check (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
    )
  );

create policy "Admin guard update beneficios productos"
  on public.beneficios_productos as restrictive for update to public
  using (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
    )
  );

create policy "Admin guard delete beneficios productos"
  on public.beneficios_productos as restrictive for delete to public
  using (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
    )
  );

commit;