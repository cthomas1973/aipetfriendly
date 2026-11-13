begin;

select plan(24);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.beneficios_productos'::regclass),
  'beneficios_productos has RLS enabled'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'beneficios_productos'
      and policyname = 'Public read beneficios productos'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and qual ilike '%active = true%'
  ),
  'public catalog policy permits active rows'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'beneficios_productos'
      and policyname = 'Admin insert beneficios productos'
      and cmd = 'INSERT'
      and permissive = 'PERMISSIVE'
      and with_check ilike '%admin_users%'
      and with_check ilike '%auth.uid%'
  ),
  'product insert policy checks admin membership'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'beneficios_productos'
      and policyname = 'Admin update beneficios productos'
      and cmd = 'UPDATE'
      and permissive = 'PERMISSIVE'
      and qual ilike '%admin_users%'
      and with_check ilike '%admin_users%'
  ),
  'product update policy checks old and new row authorization'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'beneficios_productos'
      and policyname = 'Admin delete beneficios productos'
      and cmd = 'DELETE'
      and permissive = 'PERMISSIVE'
      and qual ilike '%admin_users%'
  ),
  'product delete policy checks admin membership'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'beneficios_productos'
      and policyname = 'Public and admin guard read beneficios productos'
      and cmd = 'SELECT'
      and permissive = 'RESTRICTIVE'
      and qual ilike '%active = true%'
      and qual ilike '%admin_users%'
  ),
  'restrictive read guard limits inactive rows to admins'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'beneficios_productos'
      and policyname = 'Admin guard insert beneficios productos'
      and cmd = 'INSERT'
      and permissive = 'RESTRICTIVE'
      and with_check ilike '%admin_users%'
  )
  and exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'beneficios_productos'
      and policyname = 'Admin guard update beneficios productos'
      and cmd = 'UPDATE'
      and permissive = 'RESTRICTIVE'
      and qual ilike '%admin_users%'
      and with_check ilike '%admin_users%'
  )
  and exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'beneficios_productos'
      and policyname = 'Admin guard delete beneficios productos'
      and cmd = 'DELETE'
      and permissive = 'RESTRICTIVE'
      and qual ilike '%admin_users%'
  ),
  'restrictive policies prevent permissive product policies from reopening writes'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_users'::regclass),
  'admin_users has RLS enabled'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_users'
      and policyname = 'Block client insert admin users'
      and permissive = 'RESTRICTIVE'
      and cmd = 'INSERT'
      and with_check ilike '%false%'
  )
  and exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_users'
      and policyname = 'Block client update admin users'
      and permissive = 'RESTRICTIVE'
      and cmd = 'UPDATE'
      and qual ilike '%false%'
      and with_check ilike '%false%'
  )
  and exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_users'
      and policyname = 'Block client delete admin users'
      and permissive = 'RESTRICTIVE'
      and cmd = 'DELETE'
      and qual ilike '%false%'
  ),
  'client DML cannot self-grant admin membership'
);

select ok(
  not has_column_privilege('authenticated', 'public.users', 'access_mode', 'UPDATE')
  and has_column_privilege('authenticated', 'public.users', 'full_name', 'UPDATE')
  and has_column_privilege('authenticated', 'public.users', 'news_opt_in', 'UPDATE'),
  'authenticated can update approved profile fields but not access_mode'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'User profile insert guard'
      and permissive = 'RESTRICTIVE'
      and cmd = 'INSERT'
      and with_check ilike '%access_mode = ''free''%'
      and with_check ilike '%auth.uid() = id%'
  ),
  'client-created profiles must belong to the caller and start as free'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'Subscription insert guard'
      and permissive = 'RESTRICTIVE'
      and cmd = 'INSERT'
      and with_check ilike '%plan = ''free''%'
      and with_check ilike '%is_active%false%'
      and with_check ilike '%auth.uid() = user_id%'
  ),
  'client subscription bootstrap must be own, free, and inactive'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'Subscription update guard'
      and permissive = 'RESTRICTIVE'
      and cmd = 'UPDATE'
      and qual ilike '%false%'
      and with_check ilike '%false%'
  ),
  'client subscription updates are denied by restrictive RLS'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'Subscription delete guard'
      and permissive = 'RESTRICTIVE'
      and cmd = 'DELETE'
      and qual ilike '%false%'
  ),
  'client subscription deletes are denied by restrictive RLS'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_list_user_access'
      and p.prosecdef
      and pg_get_functiondef(p.oid) ilike '%admin_users%'
      and pg_get_functiondef(p.oid) ilike '%auth.uid()%'
  ),
  'admin_list_user_access is SECURITY DEFINER and checks admin membership'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_set_user_access'
      and p.prosecdef
      and pg_get_functiondef(p.oid) ilike '%admin_users%'
      and pg_get_functiondef(p.oid) ilike '%auth.uid()%'
  ),
  'admin_set_user_access is SECURITY DEFINER and checks admin membership'
);

select ok(
  (
    select count(*) = 2
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    where n.nspname = 'public'
      and p.proname in ('admin_list_user_access', 'admin_set_user_access')
      and p.prosecdef
      and (r.rolsuper or r.rolbypassrls)
  ),
  'admin SECURITY DEFINER RPC owners have effective RLS bypass authority'
);

select ok(
  (
    select count(*) = 2
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_list_user_access', 'admin_set_user_access')
      and p.proconfig @> array['search_path=public']::text[]
  ),
  'admin SECURITY DEFINER RPCs pin search_path to public'
);

select ok(
  has_function_privilege('authenticated', 'public.admin_list_user_access()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_set_user_access(uuid,text)', 'EXECUTE'),
  'authenticated role can invoke the admin RPC entry points'
);

select ok(
  not has_function_privilege('anon', 'public.admin_list_user_access()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_set_user_access(uuid,text)', 'EXECUTE'),
  'anonymous role has no direct EXECUTE grant on admin RPC entry points'
);

select ok(
  (select rolbypassrls from pg_roles where rolname = 'service_role'),
  'service_role has the expected BYPASSRLS role attribute'
);

select ok(
  (
    select count(*) = 2
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and t.tgname in ('trg_guard_user_access_mode', 'trg_guard_subscription_authorization')
      and t.tgenabled in ('O', 'A')
      and (
        (c.relname = 'users' and t.tgfoid = 'public.guard_user_access_mode()'::regprocedure)
        or (c.relname = 'subscriptions' and t.tgfoid = 'public.guard_subscription_authorization()'::regprocedure)
      )
  ),
  'authorization guard triggers are attached to the intended tables and enabled'
);

select ok(
  (
    select count(*) = 2
    from pg_proc p
    join pg_trigger t on t.tgfoid = p.oid
    join pg_class c on c.oid = t.tgrelid and c.relowner = p.proowner
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        (c.relname = 'users' and t.tgname = 'trg_guard_user_access_mode' and p.proname = 'guard_user_access_mode')
        or (c.relname = 'subscriptions' and t.tgname = 'trg_guard_subscription_authorization' and p.proname = 'guard_subscription_authorization')
      )
      and not p.prosecdef
      and p.proconfig @> array['search_path=public']::text[]
  ),
  'trigger guards share table ownership, run as invokers, and pin search_path'
);

select ok(
  not has_function_privilege('authenticated', 'public.guard_user_access_mode()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.guard_user_access_mode()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.guard_subscription_authorization()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.guard_subscription_authorization()', 'EXECUTE'),
  'trigger guard functions are not directly executable by client roles'
);

select * from finish();
rollback;