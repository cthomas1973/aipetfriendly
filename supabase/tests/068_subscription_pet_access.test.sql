-- Pruebas pgTAP de la migracion 067 (gracia, cancelacion pendiente, mascota
-- activa en Free, proteccion en solo lectura y excepcion de recuperacion).
--
-- ESTADO: PREPARADA (Fase 7.2). Requiere 066 y 067 aplicadas en la base local
-- de pruebas antes de ejecutarse. Mismo runner que 066/067*.test.sql.
--
-- Cobertura:
--   1. Paridad de user_premium_effective con resolveAccessState (premiumAccess.mjs).
--   2. Premium con varias mascotas (todas escribibles).
--   3. Free con una mascota activa (fallback de unica mascota) e intento de
--      tocar la mascota activa de otro usuario.
--   4. Mascotas protegidas: INSERT/UPDATE/DELETE bloqueados, lecturas intactas.
--   5. Excepcion de recuperacion de mascota perdida (incluye RPC de chapita).
--   6. Cambio de mascota activa (propiedad, cooldown 30 dias, reseteo manual
--      del timestamp denegado).
--   7. Eliminacion de mascotas (protegida y activa; FK set null; seleccion
--      inmediata tras eliminar la activa).
--   8. Recuperacion de Premium via admin (desbloqueo automatico).
--   9. Downgrade admin, primera seleccion libre y bloqueo sin eliminacion.
--  10. Gracia vigente/vencida (y auto-extension denegada), rotacion via null
--      (CRITICO-1), canceled_pending con mascotas, cotutores, 2da mascota Free
--      por API y seguridad del RPC admin.
--  En cada contexto authenticated se verifica auth.uid() (MEDIO-1).

begin;

select plan(101);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'premium7@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'free-una7@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'free-tres7@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000104', 'authenticated', 'authenticated', 'gracia7@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000105', 'authenticated', 'authenticated', 'gracia-vencida7@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000106', 'authenticated', 'authenticated', 'cancel-vigente7@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000107', 'authenticated', 'authenticated', 'cancel-vencida7@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000108', 'authenticated', 'authenticated', 'admin7@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000109', 'authenticated', 'authenticated', 'gracia-cancel7@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000110', 'authenticated', 'authenticated', 'conflicto7@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-4000-8000-000000000111', 'authenticated', 'authenticated', 'alta-admin7@example.test', 'local-test-only', now(), '{"provider":"email","providers":["email"]}', '{}');

insert into public.users (id, email, full_name, access_mode) values
  ('00000000-0000-4000-8000-000000000101', 'premium7@example.test', 'Premium dos mascotas', 'premium'),
  ('00000000-0000-4000-8000-000000000102', 'free-una7@example.test', 'Free una mascota', 'free'),
  ('00000000-0000-4000-8000-000000000103', 'free-tres7@example.test', 'Free tres mascotas', 'free'),
  ('00000000-0000-4000-8000-000000000104', 'gracia7@example.test', 'Gracia vigente', 'premium'),
  ('00000000-0000-4000-8000-000000000105', 'gracia-vencida7@example.test', 'Gracia vencida', 'premium'),
  ('00000000-0000-4000-8000-000000000106', 'cancel-vigente7@example.test', 'Cancelacion vigente', 'premium'),
  ('00000000-0000-4000-8000-000000000107', 'cancel-vencida7@example.test', 'Cancelacion vencida', 'premium'),
  ('00000000-0000-4000-8000-000000000108', 'admin7@example.test', 'Admin', 'free'),
  ('00000000-0000-4000-8000-000000000109', 'gracia-cancel7@example.test', 'Gracia mas cancelacion', 'premium'),
  ('00000000-0000-4000-8000-000000000110', 'conflicto7@example.test', 'Conflicto access free', 'free'),
  ('00000000-0000-4000-8000-000000000111', 'alta-admin7@example.test', 'Alta admin sin fila', 'premium')
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      access_mode = excluded.access_mode;

insert into public.subscriptions (user_id, plan, is_active, expires_at, grace_until, cancel_requested_at) values
  ('00000000-0000-4000-8000-000000000101', 'premium', true,  null, null, null),
  ('00000000-0000-4000-8000-000000000102', 'free',    true,  null, null, null),
  ('00000000-0000-4000-8000-000000000103', 'free',    true,  null, null, null),
  ('00000000-0000-4000-8000-000000000104', 'premium', false, now() - interval '3 days', now() + interval '4 days', null),
  ('00000000-0000-4000-8000-000000000105', 'premium', false, now() - interval '20 days', now() - interval '13 days', null),
  ('00000000-0000-4000-8000-000000000106', 'premium', true,  now() + interval '10 days', null, now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000107', 'premium', true,  now() - interval '1 day', null, now() - interval '15 days'),
  ('00000000-0000-4000-8000-000000000109', 'premium', false, now() - interval '3 days', now() + interval '4 days', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000110', 'premium', true,  null, null, null)
on conflict (user_id) do update
  set plan = excluded.plan,
      is_active = excluded.is_active,
      expires_at = excluded.expires_at,
      grace_until = excluded.grace_until,
      cancel_requested_at = excluded.cancel_requested_at;

-- 111 (alta admin): access_mode premium SIN fila de suscripcion.
delete from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000111';

insert into public.admin_users (user_id) values
  ('00000000-0000-4000-8000-000000000108')
on conflict do nothing;

insert into public.pets (id, user_id, name, breed, species, sex, weight_kg) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'P1 premium', 'Mestizo', 'dog', 'male', 10),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101', 'P2 premium', 'Mestizo', 'cat', 'female', 4),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000102', 'F1 unica', 'Mestizo', 'dog', 'female', 8),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000103', 'A activa', 'Mestizo', 'dog', 'male', 12),
  ('20000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000103', 'B protegida', 'Mestizo', 'cat', 'female', 5),
  ('20000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000103', 'C protegida', 'Mestizo', 'other', 'unknown', 2),
  ('20000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000104', 'G1 gracia', 'Mestizo', 'dog', 'male', 20),
  ('20000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000104', 'G2 gracia', 'Mestizo', 'cat', 'male', 3),
  ('20000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000105', 'H1 activa', 'Mestizo', 'dog', 'female', 15),
  ('20000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000105', 'H2 protegida', 'Mestizo', 'cat', 'male', 6),
  ('20000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000106', 'K1 cancel pendiente', 'Mestizo', 'dog', 'male', 9),
  ('20000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-000000000106', 'K2 cancel pendiente', 'Mestizo', 'cat', 'female', 4);

-- Mascota activa inicial (como backoffice: sin cooldown).
update public.users set active_pet_id = '20000000-0000-4000-8000-000000000004'
  where id = '00000000-0000-4000-8000-000000000103';
update public.users set active_pet_id = '20000000-0000-4000-8000-000000000009'
  where id = '00000000-0000-4000-8000-000000000105';

-- Datos previos de la mascota protegida B: una entrada clinica, un avistamiento,
-- una tarea de agenda y un registro de peso (para probar update/delete en
-- protegidas), mas un codigo de chapita huerfano para el camino de recuperacion.
insert into public.clinical_entries (id, pet_id, category, title, description, event_date) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', 'vaccine', 'Antirrabica', 'Dosis anual', current_date - 30);
insert into public.pet_sighting_messages (id, pet_id, source, message) values
  ('31000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', 'cartel', 'La vi en la plaza');
insert into public.preventive_tasks (id, pet_id, title, category, due_date, completed) values
  ('32000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', 'Refuerzo pendiente', 'vaccine', current_date + 10, false);
insert into public.pet_weight_logs (id, pet_id, weight_kg) values
  ('33000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', 5.0);
insert into public.pet_tag_codes (code, status) values ('TAGTEST1', 'orphan');

-- ============================================================================
-- 1) Paridad user_premium_effective <-> resolveAccessState
-- ============================================================================

select is(public.user_premium_effective('00000000-0000-4000-8000-000000000101'), true,  'premium vigente => acceso completo');
select is(public.user_premium_effective('00000000-0000-4000-8000-000000000102'), false, 'free => sin acceso completo');
select is(public.user_premium_effective('00000000-0000-4000-8000-000000000104'), true,  'gracia vigente => acceso completo temporal');
select is(public.user_premium_effective('00000000-0000-4000-8000-000000000105'), false, 'gracia vencida => free');
select is(public.user_premium_effective('00000000-0000-4000-8000-000000000106'), true,  'cancelacion con periodo pagado vigente => canceled_pending con acceso');
select is(public.user_premium_effective('00000000-0000-4000-8000-000000000107'), false, 'cancelacion con periodo vencido => free');
select is(public.user_premium_effective('00000000-0000-4000-8000-000000000109'), false, 'la cancelacion voluntaria nunca recibe gracia');
select is(public.user_premium_effective('00000000-0000-4000-8000-000000000110'), false, 'conflicto access_mode free + suscripcion premium => falla cerrado');
select is(public.user_premium_effective('00000000-0000-4000-8000-000000000111'), true,  'alta admin: access premium sin fila de suscripcion => acceso');

-- ============================================================================
-- 2) Premium con varias mascotas
-- ============================================================================

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000101', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000101)');
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000001'), true, 'premium: P1 escribible');
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000002'), true, 'premium: P2 escribible');
select lives_ok($$update public.pets set name = 'P1 editada' where id = '20000000-0000-4000-8000-000000000001'$$, 'premium edita P1');
select lives_ok($$update public.pets set name = 'P2 editada' where id = '20000000-0000-4000-8000-000000000002'$$, 'premium edita P2');
select lives_ok($$insert into public.clinical_entries (pet_id, category, title, description, event_date) values ('20000000-0000-4000-8000-000000000002', 'clinical_note', 'Control', 'Todo bien', current_date)$$, 'premium crea entrada clinica en P2');
reset role;

-- ============================================================================
-- 3) Free con una unica mascota: escribible sin seleccion explicita
-- ============================================================================

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000102', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000102)');
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000003'), true, 'free con 1 mascota: escribible por fallback de unica mascota');
select lives_ok($$update public.pets set name = 'F1 editada' where id = '20000000-0000-4000-8000-000000000003'$$, 'free edita su unica mascota');
select lives_ok($$insert into public.clinical_entries (pet_id, category, title, description, event_date) values ('20000000-0000-4000-8000-000000000003', 'deworming', 'Pipeta', 'Aplicada', current_date)$$, 'free crea entrada clinica en su unica mascota');
select throws_ok(
  $$insert into public.pet_cotutors (owner_user_id, name, email) values ('00000000-0000-4000-8000-000000000102', 'Tia', 'tia@example.test')$$,
  'P0001', null, 'free no puede dar de alta cotutores (gating existente de 056)'
);
-- Intento de fijar la mascota activa de OTRO usuario: RLS filtra la fila
-- (0 filas afectadas, sin error); se verifica abajo como postgres.
update public.users set active_pet_id = '20000000-0000-4000-8000-000000000003'
  where id = '00000000-0000-4000-8000-000000000103';
reset role;
select is(
  (select active_pet_id from public.users where id = '00000000-0000-4000-8000-000000000103')::text,
  '20000000-0000-4000-8000-000000000004',
  'un usuario no puede cambiar la mascota activa de otro (RLS filtra la fila)'
);

-- ============================================================================
-- 4) Free con tres mascotas: activa escribible, protegidas en solo lectura
-- ============================================================================

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000103', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000103', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000103)');
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000004'), true,  'free: mascota activa A escribible');
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000005'), false, 'free: mascota B protegida no escribible');
select lives_ok($$update public.pets set name = 'A editada' where id = '20000000-0000-4000-8000-000000000004'$$, 'free edita la activa');
select lives_ok($$insert into public.preventive_tasks (pet_id, title, category, due_date) values ('20000000-0000-4000-8000-000000000004', 'Vacuna anual', 'vaccine', current_date + 30)$$, 'free agenda tarea en la activa');
select lives_ok($$insert into public.pet_weight_logs (pet_id, weight_kg) values ('20000000-0000-4000-8000-000000000004', 12.5)$$, 'free registra peso en la activa');
select lives_ok($$insert into public.chat_messages (user_id, role, content, pet_id) values ('00000000-0000-4000-8000-000000000103', 'user', 'Consulta IA', '20000000-0000-4000-8000-000000000004')$$, 'free chatea sobre la activa');
select throws_ok(
  $$update public.pets set name = 'B renombrada' where id = '20000000-0000-4000-8000-000000000005'$$,
  'P0001', null, 'protegida: no se puede editar la ficha'
);
select throws_ok(
  $$insert into public.clinical_entries (pet_id, category, title, description, event_date) values ('20000000-0000-4000-8000-000000000005', 'medication', 'Antibiotico', 'Nuevo', current_date)$$,
  '42501', null, 'protegida: sin nuevas entradas clinicas'
);
select throws_ok(
  $$insert into public.preventive_tasks (pet_id, title, category, due_date) values ('20000000-0000-4000-8000-000000000005', 'Turno', 'appointment', current_date + 7)$$,
  '42501', null, 'protegida: sin nuevas tareas de agenda'
);
select throws_ok(
  $$insert into public.pet_weight_logs (pet_id, weight_kg) values ('20000000-0000-4000-8000-000000000005', 5.2)$$,
  '42501', null, 'protegida: sin nuevos registros de peso'
);
select throws_ok(
  $$insert into public.chat_messages (user_id, role, content, pet_id) values ('00000000-0000-4000-8000-000000000103', 'user', 'Consulta IA', '20000000-0000-4000-8000-000000000005')$$,
  '42501', null, 'protegida: sin Consultorio IA'
);
delete from public.clinical_entries where id = '30000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.clinical_entries where pet_id = '20000000-0000-4000-8000-000000000005'),
  1, 'protegida: el delete de historial queda filtrado por RLS (no borra nada)'
);
-- UPDATE de tarea existente en protegida: filtrado silencioso por RLS.
update public.preventive_tasks set completed = true where id = '32000000-0000-4000-8000-000000000001';
select is(
  (select completed from public.preventive_tasks where id = '32000000-0000-4000-8000-000000000001'),
  false, 'protegida: no se pueden modificar tareas de agenda existentes'
);
-- DELETE de registro de peso en protegida: filtrado silencioso por RLS.
delete from public.pet_weight_logs where id = '33000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.pet_weight_logs where pet_id = '20000000-0000-4000-8000-000000000005'),
  1, 'protegida: no se pueden borrar registros de peso existentes'
);
select is(
  (select count(*)::integer from public.pets where user_id = '00000000-0000-4000-8000-000000000103'),
  3, 'protegidas siguen visibles y consultables'
);

-- ============================================================================
-- 5) Excepcion de recuperacion de mascota perdida
-- ============================================================================

select lives_ok(
  $$update public.pets set photo_url = 'https://cdn.example.test/b.jpg', distinguishing_marks = 'Mancha blanca en pata' where id = '20000000-0000-4000-8000-000000000005'$$,
  'protegida: se pueden actualizar foto y señas particulares (cartel/QR)'
);
select is(
  (select distinguishing_marks from public.pets where id = '20000000-0000-4000-8000-000000000005'),
  'Mancha blanca en pata', 'los datos de recuperacion quedaron persistidos'
);
select throws_ok(
  $$update public.pets set photo_url = 'https://cdn.example.test/b2.jpg', name = 'B colada' where id = '20000000-0000-4000-8000-000000000005'$$,
  'P0001', null, 'la excepcion no permite colar cambios fuera de los datos de recuperacion'
);
select lives_ok(
  $$update public.pet_sighting_messages set read_at = now() where id = '31000000-0000-4000-8000-000000000001'$$,
  'protegida: los avistamientos se pueden consultar y marcar leidos'
);
select ok(
  (select read_at is not null from public.pet_sighting_messages where id = '31000000-0000-4000-8000-000000000001'),
  'el avistamiento quedo marcado como leido'
);
select lives_ok(
  $$insert into public.pet_tag_requests (pet_id, user_id, shipping_address) values ('20000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000103', 'Calle 123')$$,
  'protegida: la identificacion QR/chapita sigue operable a nivel de datos'
);
select lives_ok(
  $$select public.link_pet_tag_code('TAGTEST1', '20000000-0000-4000-8000-000000000005')$$,
  'protegida: vincular una chapita via RPC de recuperacion sigue permitido'
);
reset role;
select is(
  (select status from public.pet_tag_codes where code = 'TAGTEST1'),
  'linked', 'la chapita quedo vinculada a la mascota protegida'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000103', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000103', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000103)');

-- ============================================================================
-- 6) Cambio de mascota activa: propiedad y cooldown
-- ============================================================================

select throws_ok(
  $$update public.users set active_pet_changed_at = now() - interval '90 days' where id = '00000000-0000-4000-8000-000000000103'$$,
  '42501', null, 'sin grant de columna: el usuario no puede resetear el cooldown manualmente'
);
select throws_ok(
  $$update public.users set active_pet_id = '20000000-0000-4000-8000-000000000001' where id = '00000000-0000-4000-8000-000000000103'$$,
  'P0001', null, 'no se puede elegir como activa una mascota ajena'
);
select lives_ok(
  $$update public.users set active_pet_id = '20000000-0000-4000-8000-000000000005' where id = '00000000-0000-4000-8000-000000000103'$$,
  'primer cambio real de activa (A -> B) permitido'
);
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000005'), true,  'B es ahora la escribible');
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000004'), false, 'A quedo protegida tras el cambio');
select throws_ok(
  $$update public.users set active_pet_id = '20000000-0000-4000-8000-000000000006' where id = '00000000-0000-4000-8000-000000000103'$$,
  'P0001', null, 'segundo cambio dentro de 30 dias bloqueado (cooldown)'
);
select lives_ok(
  $$update public.users set active_pet_id = null where id = '00000000-0000-4000-8000-000000000103'$$,
  'limpiar la seleccion esta permitido'
);
select throws_ok(
  $$update public.users set active_pet_id = '20000000-0000-4000-8000-000000000006' where id = '00000000-0000-4000-8000-000000000103'$$,
  'P0001', null, 'el cooldown no se evade pasando por null'
);
reset role;
select lives_ok(
  $$update public.users set active_pet_id = '20000000-0000-4000-8000-000000000005' where id = '00000000-0000-4000-8000-000000000103'$$,
  'backoffice/servicio puede fijar la activa sin cooldown'
);

-- ============================================================================
-- 7) Eliminacion de mascotas
-- ============================================================================

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000103', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000103', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000103)');
select lives_ok(
  $$delete from public.pets where id = '20000000-0000-4000-8000-000000000006'$$,
  'eliminar una mascota protegida es decision del dueño (permitido)'
);
select lives_ok(
  $$delete from public.pets where id = '20000000-0000-4000-8000-000000000005'$$,
  'eliminar la mascota activa esta permitido'
);
reset role;
select ok(
  (select active_pet_id is null from public.users where id = '00000000-0000-4000-8000-000000000103'),
  'al eliminar la activa, active_pet_id vuelve a null (FK set null)'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000103', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000103', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000103)');
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000004'), true, 'queda una sola mascota: vuelve a ser escribible por fallback');
select lives_ok(
  $$update public.users set active_pet_id = '20000000-0000-4000-8000-000000000004' where id = '00000000-0000-4000-8000-000000000103'$$,
  'tras eliminar la activa se puede elegir otra de inmediato (cooldown reseteado por trg_reset_active_pet_cooldown)'
);
reset role;

-- ============================================================================
-- 8) Recuperacion de Premium via admin: desbloqueo automatico
-- ============================================================================

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000108', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000108","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000108', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000108)');
select lives_ok(
  $$select public.admin_set_user_access('00000000-0000-4000-8000-000000000103', 'premium')$$,
  'el admin promueve la cuenta a premium'
);
reset role;
select is((select plan from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000103'), 'premium', 'alta admin: plan premium sincronizado');
select is((select is_active from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000103'), true, 'alta admin: suscripcion activa');
select ok((select expires_at is null from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000103'), 'alta admin: sin vencimiento residual (bug de expires_at corregido)');
select ok((select grace_until is null and cancel_requested_at is null from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000103'), 'alta admin: gracia y cancelacion limpias');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000103', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000103', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000103)');
select lives_ok(
  $$insert into public.pets (id, user_id, name, breed, species, sex, weight_kg) values ('20000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000103', 'D nueva', 'Mestizo', 'dog', 'male', 7)$$,
  'premium recuperado: puede volver a crear mascotas'
);
select ok(
  public.pet_is_writable('20000000-0000-4000-8000-000000000004')
  and public.pet_is_writable('20000000-0000-4000-8000-00000000000b'),
  'premium recuperado: TODAS las mascotas escribibles sin re-seleccion'
);
reset role;

-- ============================================================================
-- 9) Downgrade admin y primera seleccion libre
-- ============================================================================

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000108', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000108","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000108', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000108)');
select lives_ok(
  $$select public.admin_set_user_access('00000000-0000-4000-8000-000000000101', 'free')$$,
  'el admin degrada la cuenta premium a free'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000101', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000101)');
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000001'), false, 'degradado con 2 mascotas y sin seleccion: P1 protegida');
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000002'), false, 'degradado con 2 mascotas y sin seleccion: P2 protegida');
select lives_ok(
  $$update public.users set active_pet_id = '20000000-0000-4000-8000-000000000001' where id = '00000000-0000-4000-8000-000000000101'$$,
  'la primera seleccion tras el downgrade no tiene cooldown'
);
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000001'), true, 'la elegida vuelve a ser escribible');
select throws_ok(
  $$update public.users set active_pet_id = '20000000-0000-4000-8000-000000000002' where id = '00000000-0000-4000-8000-000000000101'$$,
  'P0001', null, 'sin eliminacion de la activa no hay cambio gratuito (cooldown vigente)'
);
reset role;

-- ============================================================================
-- 10) Gracia, rotacion via null, canceled_pending y seguridad
-- ============================================================================

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000104', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000104","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000104', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000104)');
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000007'), true, 'gracia vigente: todas las mascotas escribibles');
select lives_ok(
  $$insert into public.clinical_entries (pet_id, category, title, description, event_date) values ('20000000-0000-4000-8000-000000000007', 'treatment', 'Curacion', 'Herida leve', current_date)$$,
  'gracia vigente: puede registrar historial'
);
select lives_ok(
  $$insert into public.pet_cotutors (owner_user_id, name, email) values ('00000000-0000-4000-8000-000000000104', 'Cotutor gracia', 'cotutor-gracia@example.test')$$,
  'gracia vigente: conserva funciones premium como cotutores'
);
-- Intento de auto-extender la gracia / limpiar la cancelacion: la politica
-- restrictiva de 066 filtra el UPDATE (0 filas, sin error).
update public.subscriptions
  set grace_until = now() + interval '90 days'
  where user_id = '00000000-0000-4000-8000-000000000104';
select ok(
  (select grace_until < now() + interval '5 days' from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000104'),
  'el cliente no puede extender su propia gracia (guard de 066 intacto)'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000105', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000105","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000105', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000105)');
select is(public.pet_is_writable('20000000-0000-4000-8000-000000000009'), true,  'gracia vencida: solo la activa escribible');
select is(public.pet_is_writable('20000000-0000-4000-8000-00000000000a'), false, 'gracia vencida: el resto protegido');

-- Ataque de rotacion A -> NULL -> B -> NULL -> C (CRITICO-1 de la auditoria
-- 7.2.1). El usuario 105 nunca registro timestamp (la activa H1 la fijo el
-- backoffice): la primera seleccion via null pasa pero registra el cooldown,
-- y la segunda vuelta queda bloqueada.
select lives_ok(
  $$update public.users set active_pet_id = null where id = '00000000-0000-4000-8000-000000000105'$$,
  'rotacion: liberar la activa esta permitido'
);
select lives_ok(
  $$update public.users set active_pet_id = '20000000-0000-4000-8000-00000000000a' where id = '00000000-0000-4000-8000-000000000105'$$,
  'rotacion: la primera seleccion via null (sin timestamp previo) esta permitida'
);
select lives_ok(
  $$update public.users set active_pet_id = null where id = '00000000-0000-4000-8000-000000000105'$$,
  'rotacion: segunda liberacion permitida (pasar a null no borra el timestamp)'
);
select throws_ok(
  $$update public.users set active_pet_id = '20000000-0000-4000-8000-000000000009' where id = '00000000-0000-4000-8000-000000000105'$$,
  'P0001', null, 'rotacion A -> null -> B -> null -> C bloqueada por cooldown'
);
reset role;
select ok(
  (select active_pet_changed_at is not null from public.users where id = '00000000-0000-4000-8000-000000000105'),
  'la seleccion via null registro el timestamp del cooldown'
);

-- canceled_pending con mascotas: acceso de escritura completo mientras el
-- periodo pagado siga vigente.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000106', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000106","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000106', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000106)');
select is(public.pet_is_writable('20000000-0000-4000-8000-00000000000c'), true, 'canceled_pending: K1 escribible hasta el vencimiento');
select is(public.pet_is_writable('20000000-0000-4000-8000-00000000000d'), true, 'canceled_pending: K2 escribible hasta el vencimiento');
select lives_ok(
  $$insert into public.clinical_entries (pet_id, category, title, description, event_date) values ('20000000-0000-4000-8000-00000000000c', 'clinical_note', 'Control', 'Sin novedades', current_date)$$,
  'canceled_pending: puede registrar historial mientras no venza'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}', true);
set local role authenticated;
select is(auth.uid()::text, '00000000-0000-4000-8000-000000000102', 'auth.uid() resuelve la identidad simulada (00000000-0000-4000-8000-000000000102)');
-- Limite de creacion en Free diferido a la Etapa 5: la 2da mascota se puede
-- insertar via API pero nace protegida (sin seleccion, ninguna es escribible).
select lives_ok(
  $$insert into public.pets (id, user_id, name, breed, species, sex, weight_kg) values ('20000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-000000000102', 'F2 extra', 'Mestizo', 'cat', 'female', 3)$$,
  'free puede insertar una 2da mascota via API (limite DB diferido, documentado en 067)'
);
select ok(
  not public.pet_is_writable('20000000-0000-4000-8000-00000000000e'),
  'la 2da mascota de un Free nace protegida (el abuso no otorga escritura)'
);
select ok(
  not public.pet_is_writable('20000000-0000-4000-8000-000000000003'),
  'con 2 mascotas y sin seleccion, la original tambien queda protegida'
);
select throws_ok(
  $$select public.admin_set_user_access('00000000-0000-4000-8000-000000000102', 'premium')$$,
  'P0001', 'No autorizado', 'un usuario comun no puede invocar el RPC admin'
);
reset role;

select * from finish();
rollback;
