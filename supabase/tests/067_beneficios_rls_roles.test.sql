begin;

select plan(64);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'free@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'premium@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'admin-free@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'admin-premium@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'bootstrap@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'service-target@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'service-admin-target@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}');

insert into public.users (id, email, full_name, access_mode) values
  ('00000000-0000-4000-8000-000000000002', 'free@example.test', 'Free original', 'free'),
  ('00000000-0000-4000-8000-000000000003', 'premium@example.test', 'Premium original', 'premium'),
  ('00000000-0000-4000-8000-000000000004', 'admin-free@example.test', 'Admin free', 'free'),
  ('00000000-0000-4000-8000-000000000005', 'admin-premium@example.test', 'Admin premium', 'premium'),
  ('00000000-0000-4000-8000-000000000007', 'service-target@example.test', 'Service target', 'free'),
  ('00000000-0000-4000-8000-000000000008', 'service-admin-target@example.test', 'Service admin target', 'free')
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      access_mode = excluded.access_mode;

insert into public.subscriptions (user_id, plan, is_active, expires_at) values
  ('00000000-0000-4000-8000-000000000002', 'free', false, null),
  ('00000000-0000-4000-8000-000000000003', 'premium', true, null),
  ('00000000-0000-4000-8000-000000000004', 'free', false, null),
  ('00000000-0000-4000-8000-000000000005', 'premium', true, null),
  ('00000000-0000-4000-8000-000000000007', 'free', false, null)
on conflict (user_id) do update
  set plan = excluded.plan,
      is_active = excluded.is_active,
      expires_at = excluded.expires_at;

-- Auth bootstrap triggers, if present in the test stack, must not leave the
-- bootstrap identity pre-created before its client INSERT case.
delete from public.users where id = '00000000-0000-4000-8000-000000000006';
delete from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000006';

insert into public.admin_users (user_id) values
  ('00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000005');

insert into public.beneficios_productos (id, url_ml, mla_id, permalink, title, grupo, active) values
  ('10000000-0000-4000-8000-000000000001', 'https://articulo.mercadolibre.com.ar/MLA-1234567890', 'MLA-1234567890', 'https://articulo.mercadolibre.com.ar/MLA-1234567890', 'Producto activo original', 'alimentos', true),
  ('10000000-0000-4000-8000-000000000002', 'https://articulo.mercadolibre.com.ar/MLA-1234567891', 'MLA-1234567891', 'https://articulo.mercadolibre.com.ar/MLA-1234567891', 'Producto inactivo original', 'alimentos', false);

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is(current_user::text, 'anon', 'database role is actually anon');
select is(auth.role(), 'anon', 'JWT role claim is anon');
select is((select count(*)::integer from public.beneficios_productos), 1, 'anon reads active catalog rows only');
select throws_ok(
  $$insert into public.beneficios_productos (url_ml, mla_id, permalink, title) values ('https://articulo.mercadolibre.com.ar/MLA-2234567890', 'MLA-2234567890', 'https://articulo.mercadolibre.com.ar/MLA-2234567890', 'anon insert')$$,
  '42501', null, 'anon cannot insert products'
);
select throws_ok(
  $$select public.admin_set_user_access('00000000-0000-4000-8000-000000000002', 'premium')$$,
  'anonymous caller cannot successfully invoke the admin SECURITY DEFINER RPC'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000002', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000002)');
select is(current_user::text, 'authenticated', 'database role is actually authenticated for Free user');
select is(auth.role(), 'authenticated', 'JWT role claim is authenticated for Free user');
select is((select count(*)::integer from public.beneficios_productos), 1, 'Free user reads active catalog rows only');
select throws_ok(
  $$insert into public.beneficios_productos (url_ml, mla_id, permalink, title) values ('https://articulo.mercadolibre.com.ar/MLA-2234567891', 'MLA-2234567891', 'https://articulo.mercadolibre.com.ar/MLA-2234567891', 'free insert')$$,
  '42501', null, 'Free user cannot insert products'
);
update public.beneficios_productos set title = 'Free attempted update' where id = '10000000-0000-4000-8000-000000000001';
reset role;
select is((select title from public.beneficios_productos where id = '10000000-0000-4000-8000-000000000001'), 'Producto activo original', 'Free update affects zero rows');
set local role authenticated;
delete from public.beneficios_productos where id = '10000000-0000-4000-8000-000000000001';
reset role;
select ok(exists (select 1 from public.beneficios_productos where id = '10000000-0000-4000-8000-000000000001'), 'Free delete affects zero rows');

set local role authenticated;
select lives_ok(
  $$update public.users set full_name = 'Free changed own profile' where id = '00000000-0000-4000-8000-000000000002'$$,
  'Free user can update an allowed field on own profile'
);
select is((select full_name from public.users where id = '00000000-0000-4000-8000-000000000002'), 'Free changed own profile', 'own allowed profile edit persists');
update public.users set full_name = 'Cross-user attempt' where id = '00000000-0000-4000-8000-000000000003';
reset role;
select is((select full_name from public.users where id = '00000000-0000-4000-8000-000000000003'), 'Premium original', 'cross-user profile update affects zero rows');
set local role authenticated;
select throws_ok(
  $$update public.users set access_mode = 'premium' where id = '00000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'Free user lacks column privilege to self-promote through access_mode'
);
select throws_ok(
  $$insert into public.admin_users (user_id) values ('00000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'Free user cannot grant self admin membership'
);
update public.subscriptions set plan = 'premium', is_active = true where user_id = '00000000-0000-4000-8000-000000000002';
update public.subscriptions set expires_at = '2099-01-01T00:00:00Z' where user_id = '00000000-0000-4000-8000-000000000002';
reset role;
select is((select plan from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000002'), 'free', 'Free subscription promotion changes zero rows');
select is((select is_active from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000002'), false, 'Free subscription remains inactive');
select is((select expires_at from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000002'), null::timestamptz, 'client cannot extend subscription expiry directly');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000006', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000006)');
select throws_ok(
  $$insert into public.users (id, email, access_mode) values ('00000000-0000-4000-8000-000000000006', 'bootstrap@example.test', 'premium')$$,
  '42501', null, 'client cannot bootstrap a Premium profile'
);
select lives_ok(
  $$insert into public.users (id, email, access_mode) values ('00000000-0000-4000-8000-000000000006', 'bootstrap@example.test', 'free')$$,
  'client can bootstrap an own Free profile'
);
select throws_ok(
  $$insert into public.subscriptions (user_id, plan, is_active) values ('00000000-0000-4000-8000-000000000006', 'premium', true)$$,
  'P0001', null, 'client cannot bootstrap a Premium subscription; trigger rejects before RLS check'
);
select lives_ok(
  $$insert into public.subscriptions (user_id, plan, is_active) values ('00000000-0000-4000-8000-000000000006', 'free', false)$$,
  'client can bootstrap an own Free inactive subscription'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000003', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000003)');
select throws_ok(
  $$insert into public.beneficios_productos (url_ml, mla_id, permalink, title) values ('https://articulo.mercadolibre.com.ar/MLA-2234567892', 'MLA-2234567892', 'https://articulo.mercadolibre.com.ar/MLA-2234567892', 'premium non-admin insert')$$,
  '42501', null, 'Premium without Admin cannot insert products'
);
update public.beneficios_productos set title = 'Premium attempted update' where id = '10000000-0000-4000-8000-000000000001';
reset role;
select is((select title from public.beneficios_productos where id = '10000000-0000-4000-8000-000000000001'), 'Producto activo original', 'Premium without Admin update affects zero rows');
set local role authenticated;
delete from public.beneficios_productos where id = '10000000-0000-4000-8000-000000000001';
reset role;
select ok(exists (select 1 from public.beneficios_productos where id = '10000000-0000-4000-8000-000000000001'), 'Premium without Admin delete affects zero rows');
set local role authenticated;
select throws_ok(
  $$select public.admin_set_user_access('00000000-0000-4000-8000-000000000002', 'premium')$$,
  'P0001', 'No autorizado', 'Premium without Admin cannot call admin_set_user_access successfully'
);
select throws_ok(
  $$select * from public.admin_list_user_access()$$,
  'P0001', 'No autorizado', 'Premium without Admin cannot call admin_list_user_access successfully'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000004', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000004)');
select is((select count(*)::integer from public.beneficios_productos), 2, 'Admin Free can read inactive catalog rows');
select lives_ok(
  $$insert into public.beneficios_productos (url_ml, mla_id, permalink, title) values ('https://articulo.mercadolibre.com.ar/MLA-4234567890', 'MLA-4234567890', 'https://articulo.mercadolibre.com.ar/MLA-4234567890', 'admin free insert')$$,
  'Admin Free can insert products without Premium'
);
select lives_ok(
  $$update public.beneficios_productos set title = 'Admin Free update' where id = '10000000-0000-4000-8000-000000000001'$$,
  'Admin Free can update products'
);
select lives_ok(
  $$delete from public.beneficios_productos where mla_id = 'MLA-4234567890'$$,
  'Admin Free can delete products'
);
select lives_ok($$select * from public.admin_list_user_access()$$, 'Admin Free can invoke admin_list_user_access');
select lives_ok($$select public.admin_set_user_access('00000000-0000-4000-8000-000000000002', 'premium')$$, 'Admin Free can invoke SECURITY DEFINER access RPC');
reset role;
select is((select access_mode from public.users where id = '00000000-0000-4000-8000-000000000002'), 'premium', 'SECURITY DEFINER RPC updates access_mode through trusted owner role');
select is((select plan from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000002'), 'premium', 'SECURITY DEFINER RPC updates subscription plan');
select is((select is_active from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000002'), true, 'SECURITY DEFINER RPC activates subscription');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000002', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000002)');
select throws_ok(
  $$insert into public.beneficios_productos (url_ml, mla_id, permalink, title) values ('https://articulo.mercadolibre.com.ar/MLA-4234567891', 'MLA-4234567891', 'https://articulo.mercadolibre.com.ar/MLA-4234567891', 'promoted premium insert')$$,
  '42501', null, 'SECURITY DEFINER promotion does not grant product-admin membership'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000005', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000005)');
select lives_ok(
  $$insert into public.beneficios_productos (url_ml, mla_id, permalink, title) values ('https://articulo.mercadolibre.com.ar/MLA-5234567890', 'MLA-5234567890', 'https://articulo.mercadolibre.com.ar/MLA-5234567890', 'admin premium insert')$$,
  'Admin Premium can insert products'
);
select lives_ok(
  $$update public.beneficios_productos set title = 'Admin Premium update' where id = '10000000-0000-4000-8000-000000000001'$$,
  'Admin Premium can update products'
);
select lives_ok(
  $$delete from public.beneficios_productos where mla_id = 'MLA-5234567890'$$,
  'Admin Premium can delete products'
);
reset role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(current_user::text, 'service_role', 'database role is actually service_role');
select is(auth.role(), 'service_role', 'JWT role claim is service_role');
select lives_ok(
  $$update public.users set access_mode = 'premium' where id = '00000000-0000-4000-8000-000000000007'$$,
  'service_role can update authorization profile state directly'
);
select lives_ok(
  $$update public.subscriptions set plan = 'premium', is_active = true, expires_at = '2020-01-01T00:00:00Z' where user_id = '00000000-0000-4000-8000-000000000007'$$,
  'service_role can update subscription authorization and expiry fields directly'
);
select lives_ok(
  $$insert into public.subscriptions (user_id, plan, is_active, expires_at) values ('00000000-0000-4000-8000-000000000008', 'premium', true, null)$$,
  'service_role can insert a Premium subscription when no row exists'
);
select lives_ok(
  $$insert into public.beneficios_productos (url_ml, mla_id, permalink, title) values ('https://articulo.mercadolibre.com.ar/MLA-6234567890', 'MLA-6234567890', 'https://articulo.mercadolibre.com.ar/MLA-6234567890', 'service role insert')$$,
  'service_role bypasses product RLS for trusted API writes'
);
select lives_ok(
  $$insert into public.admin_users (user_id) values ('00000000-0000-4000-8000-000000000008')$$,
  'service_role can manage admin membership as a trusted role'
);
reset role;
select is((select access_mode from public.users where id = '00000000-0000-4000-8000-000000000007'), 'premium', 'service_role profile update persisted');
select is((select plan || ':' || is_active::text from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000007'), 'premium:true', 'service_role subscription update persisted');
select is((select expires_at from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000007'), '2020-01-01T00:00:00Z'::timestamptz, 'service_role can persist expires_at');
select is((select plan || ':' || is_active::text from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000008'), 'premium:true', 'service_role subscription insert persisted');
select ok(exists (select 1 from public.beneficios_productos where mla_id = 'MLA-6234567890'), 'service_role product write persisted');
select ok(exists (select 1 from public.admin_users where user_id = '00000000-0000-4000-8000-000000000008'), 'service_role admin membership write persisted');

delete from public.admin_users where user_id = '00000000-0000-4000-8000-000000000004';
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000004', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000004)');
select throws_ok(
  $$insert into public.beneficios_productos (url_ml, mla_id, permalink, title) values ('https://articulo.mercadolibre.com.ar/MLA-4234567892', 'MLA-4234567892', 'https://articulo.mercadolibre.com.ar/MLA-4234567892', 'revoked admin insert')$$,
  '42501', null, 'Admin Free loses product write access when membership is revoked'
);
select throws_ok(
  $$select public.admin_set_user_access('00000000-0000-4000-8000-000000000002', 'premium')$$,
  'P0001', 'No autorizado', 'revoked Admin cannot invoke admin_set_user_access successfully'
);
select throws_ok(
  $$select * from public.admin_list_user_access()$$,
  'P0001', 'No autorizado', 'revoked Admin cannot invoke admin_list_user_access successfully'
);
reset role;

select * from finish();
rollback;
