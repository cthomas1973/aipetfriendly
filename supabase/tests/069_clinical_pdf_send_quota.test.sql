-- PREPARADA, NO EJECUTADA. Solo base local desechable con 066, 067 y 069.
-- Requiere pgTAP. No aplicar migraciones ni ejecutar contra el remoto.
begin;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data)
select ('69000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', 'pdf' || n || '@example.test', 'local-test-only',
  now(), '{"provider":"email","providers":["email"]}', '{}'
from generate_series(1, 10) n;

insert into public.users (id, email, access_mode)
select id, email, case when email in ('pdf2@example.test', 'pdf4@example.test', 'pdf5@example.test', 'pdf9@example.test')
  then 'premium' when email = 'pdf3@example.test' then 'guest' else 'free' end
from auth.users where id::text like '69000000-0000-4000-8000-%'
on conflict (id) do update set access_mode = excluded.access_mode;

insert into public.subscriptions (user_id, plan, is_active, expires_at, grace_until, cancel_requested_at)
values
 ('69000000-0000-4000-8000-000000000002', 'premium', true, null, null, null),
 ('69000000-0000-4000-8000-000000000004', 'premium', false, now() - interval '1 day', now() + interval '1 day', null),
 ('69000000-0000-4000-8000-000000000005', 'premium', true, now() + interval '1 day', null, now() - interval '1 day'),
 ('69000000-0000-4000-8000-000000000009', 'premium', true, null, null, null)
on conflict (user_id) do update set plan = excluded.plan, is_active = excluded.is_active,
  expires_at = excluded.expires_at, grace_until = excluded.grace_until,
  cancel_requested_at = excluded.cancel_requested_at;

create function pg_temp.pdf_user(n integer) returns uuid language sql immutable as $$
  select ('69000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create function pg_temp.pdf_request(n integer) returns uuid language sql immutable as $$
  select ('69000001-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create function pg_temp.pdf_reserve(u integer, r integer) returns jsonb language sql as $$
  select public.reserve_clinical_pdf_send(pg_temp.pdf_user(u), pg_temp.pdf_request(r), repeat('a', 64));
$$;

select ok((select relrowsecurity from pg_class where oid = 'public.clinical_pdf_sends'::regclass), 'RLS habilitada');
select ok(not has_table_privilege('authenticated', 'public.clinical_pdf_sends', 'INSERT'), 'Cliente no reserva por INSERT');
select ok(not has_table_privilege('authenticated', 'public.clinical_pdf_sends', 'UPDATE'), 'Cliente no libera/falsea estados');
select ok(not has_table_privilege('authenticated', 'public.clinical_pdf_sends', 'SELECT'), 'Registro privado sin datos cruzados');
select ok(not has_function_privilege('authenticated', 'public.reserve_clinical_pdf_send(uuid,uuid,text)', 'EXECUTE'), 'Reserva solo service role');
select ok(not has_function_privilege('anon', 'public.get_clinical_pdf_quota()', 'EXECUTE'), 'Anon sin cupo');
select ok(has_function_privilege('authenticated', 'public.get_clinical_pdf_quota()', 'EXECUTE'), 'Cuenta consulta su propio cupo');
select ok(not has_function_privilege('authenticated', 'public.clinical_pdf_quota_for_user(uuid)', 'EXECUTE'), 'Cuenta no consulta cupo ajeno');
select ok(not has_function_privilege('authenticated', 'public.transition_clinical_pdf_send(uuid,uuid,text,text)', 'EXECUTE'), 'Cuenta no finaliza reservas');

select is(public.clinical_pdf_quota_for_user(pg_temp.pdf_user(1))->>'limit', '2', 'Free: 2 por mes');
select is(public.clinical_pdf_quota_for_user(pg_temp.pdf_user(2))->>'limit', '5', 'Premium: 5 por dia');
select is(public.clinical_pdf_quota_for_user(pg_temp.pdf_user(4))->>'plan', 'premium', 'Gracia vigente recibe Premium');
select is(public.clinical_pdf_quota_for_user(pg_temp.pdf_user(5))->>'plan', 'premium', 'Canceled pending recibe Premium');
select throws_ok($$select pg_temp.pdf_reserve(3, 1)$$, '42501', null, 'Guest sin envio');
select throws_ok($$select public.reserve_clinical_pdf_send(null, gen_random_uuid(), repeat('a',64))$$,
  '22023', null, 'No acepta identidad nula');

set local role service_role;
select is(pg_temp.pdf_reserve(1, 1)->>'result', 'reserved', 'Free primer envio reservado');
select is(pg_temp.pdf_reserve(1, 1)->>'result', 'pending', 'Reintento no obtiene otra reserva');
select is(public.reserve_clinical_pdf_send(pg_temp.pdf_user(1), pg_temp.pdf_request(1), repeat('b', 64))->>'result',
  'conflict', 'Misma clave con otro PDF/destinatario no se acepta');
select is(pg_temp.pdf_reserve(1, 2)->>'result', 'reserved', 'Free segundo envio reservado');
select is(pg_temp.pdf_reserve(1, 3)->>'result', 'quota_exceeded', 'Free tercer envio denegado incluso con reservas en curso');
select is(public.transition_clinical_pdf_send(pg_temp.pdf_user(1), pg_temp.pdf_request(1), 'sending')->>'used',
  '2', 'Enviar mantiene reserva');
select is(public.transition_clinical_pdf_send(pg_temp.pdf_user(1), pg_temp.pdf_request(1), 'sent', 'test-provider')->>'used',
  '2', 'Confirmar no duplica consumo');
select is(pg_temp.pdf_reserve(1, 1)->>'result', 'sent', 'Reintento confirmado devuelve resultado idempotente');
select throws_ok($$select public.transition_clinical_pdf_send(pg_temp.pdf_user(1), pg_temp.pdf_request(1), 'failed')$$,
  '22023', null, 'No se libera un correo ya enviado');
select is(public.transition_clinical_pdf_send(pg_temp.pdf_user(1), pg_temp.pdf_request(2), 'failed')->>'remaining',
  '1', 'Fallo previo al proveedor libera cupo');
select is(pg_temp.pdf_reserve(1, 2)->>'result', 'failed', 'Clave fallida no se reutiliza para otro envio');
select is(pg_temp.pdf_reserve(1, 3)->>'result', 'reserved', 'Nueva clave usa cupo liberado');
select is(public.transition_clinical_pdf_send(pg_temp.pdf_user(1), pg_temp.pdf_request(3), 'sending')->>'used',
  '2', 'Segundo intento en curso');
select is(public.transition_clinical_pdf_send(pg_temp.pdf_user(1), pg_temp.pdf_request(3), 'uncertain')->>'remaining',
  '0', 'Resultado ambiguo conserva cupo');
select is(pg_temp.pdf_reserve(1, 3)->>'result', 'pending', 'Envio incierto no se reenvia');
select is((select count(*)::integer from public.clinical_pdf_sends where user_id = pg_temp.pdf_user(1)),
  3, 'Sin filas duplicadas por reintentos');

select is((select array_agg(pg_temp.pdf_reserve(2, n)->>'result') from generate_series(1, 5) n),
  array['reserved','reserved','reserved','reserved','reserved']::text[], 'Premium permite cinco reservas');
select is(pg_temp.pdf_reserve(2, 6)->>'result', 'quota_exceeded', 'Premium sexto envio denegado');
reset role;

-- Cambio de plan no reinicia consumo.
update public.users set access_mode = 'premium' where id = pg_temp.pdf_user(1);
update public.subscriptions set plan = 'premium', is_active = true, expires_at = null where user_id = pg_temp.pdf_user(1);
-- El bootstrap puede no haber creado fila de suscripcion: alta admin tambien es Premium.
select is(public.clinical_pdf_quota_for_user(pg_temp.pdf_user(1))->>'used', '2', 'Upgrade conserva envios del dia');
update public.users set access_mode = 'free' where id = pg_temp.pdf_user(2);
select is(public.clinical_pdf_quota_for_user(pg_temp.pdf_user(2))->>'remaining', '0', 'Downgrade no regala cupo mensual');

update public.subscriptions set grace_until = now() - interval '1 second' where user_id = pg_temp.pdf_user(4);
select is(public.clinical_pdf_quota_for_user(pg_temp.pdf_user(4))->>'plan', 'free', 'Gracia vencida vuelve a Free');
update public.subscriptions set expires_at = now() - interval '1 second', grace_until = now() + interval '1 day'
  where user_id = pg_temp.pdf_user(5);
select is(public.clinical_pdf_quota_for_user(pg_temp.pdf_user(5))->>'plan', 'free', 'Cancelacion vencida no recibe gracia');

-- Bordes calendario: el consumo anterior no se traslada al periodo nuevo.
insert into public.clinical_pdf_sends(user_id, request_id, payload_hash, status, created_at)
values (pg_temp.pdf_user(6), pg_temp.pdf_request(1), repeat('a',64), 'sent',
  (date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
    at time zone 'America/Argentina/Buenos_Aires') - interval '1 second');
select is(public.clinical_pdf_quota_for_user(pg_temp.pdf_user(6))->>'used', '0', 'Mes anterior excluido');
select is((public.clinical_pdf_quota_for_user(pg_temp.pdf_user(6))->>'resetAt')::timestamptz,
  (date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') + interval '1 month')
    at time zone 'America/Argentina/Buenos_Aires', 'Reset mensual a medianoche Buenos Aires');
select is(to_char('2026-06-01T02:59:59Z'::timestamptz at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'),
  '2026-05-31', 'Paridad JS antes de medianoche');
select is(to_char('2026-06-01T03:00:00Z'::timestamptz at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'),
  '2026-06-01', 'Paridad JS despues de medianoche');

insert into public.clinical_pdf_sends(user_id, request_id, payload_hash, status, created_at)
select pg_temp.pdf_user(9), pg_temp.pdf_request(n), repeat('a',64), 'sent',
  (date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
    at time zone 'America/Argentina/Buenos_Aires') - interval '1 second'
from generate_series(1,5) n;
select is(public.clinical_pdf_quota_for_user(pg_temp.pdf_user(9))->>'used', '0', 'Dia anterior excluido de cupo Premium');
select is((select array_agg(pg_temp.pdf_reserve(9, n)->>'result') from generate_series(6,10) n),
  array['reserved','reserved','reserved','reserved','reserved']::text[], '5 ayer + 5 hoy no dispara tope tecnico prematuramente');
select is((public.clinical_pdf_quota_for_user(pg_temp.pdf_user(9))->>'resetAt')::timestamptz,
  (date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires') + interval '1 day')
    at time zone 'America/Argentina/Buenos_Aires', 'Reset diario en Buenos Aires');

insert into public.clinical_pdf_sends(user_id, request_id, payload_hash, status, created_at)
values (pg_temp.pdf_user(10), pg_temp.pdf_request(1), repeat('a',64), 'reserved',
  now() - interval '2 months');
select is(pg_temp.pdf_reserve(10, 1)->>'result', 'pending', 'Reserva antigua no se recicla ni reenvia automaticamente');

insert into public.clinical_pdf_sends(user_id, request_id, payload_hash, status)
select pg_temp.pdf_user(7), pg_temp.pdf_request(n), repeat('a',64), 'failed' from generate_series(1,10) n;
select is(pg_temp.pdf_reserve(7, 11)->>'result', 'rate_limited', '10 fallos tambien activan proteccion tecnica');
select is(public.clinical_pdf_quota_for_user(pg_temp.pdf_user(7))->>'remaining', '2', 'Antibuso independiente del cupo comercial');
update public.clinical_pdf_sends set created_at = now() - interval '25 hours' where user_id = pg_temp.pdf_user(7);
select is(pg_temp.pdf_reserve(7, 11)->>'result', 'reserved', 'Intentos antiguos dejan de limitar');

update auth.users set is_anonymous = true where id = pg_temp.pdf_user(8);
select throws_ok($$select pg_temp.pdf_reserve(8, 1)$$, '42501', null, 'Auth anonima tampoco recibe cupo Free');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"69000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is(auth.uid(), '69000000-0000-4000-8000-000000000006'::uuid, 'Identidad de prueba comprobada');
select is(public.get_clinical_pdf_quota()->>'used', '0', 'RPC publico consulta solo cuenta propia');
select throws_ok($$select * from public.clinical_pdf_sends$$, '42501', null, 'Cliente no lee ledger ni hashes ajenos');
select throws_ok($$select public.reserve_clinical_pdf_send(gen_random_uuid(), gen_random_uuid(), repeat('a',64))$$,
  '42501', null, 'Cliente no puede suplantar identidad de reserva');
reset role;

select * from finish();
rollback;
