-- PREPARADA, NO EJECUTADA. Solo PostgreSQL local desechable con pgTAP y
-- baseline -> 066 -> 067 -> 069 -> 070. Todo se revierte al terminar.
begin;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data)
select ('70000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', 'recovery' || n || '@example.test', 'local-test-only',
  now(), '{"provider":"email","providers":["email"]}', '{}'
from generate_series(1, 2) n;
insert into public.users (id, email, access_mode)
select id, email, 'free' from auth.users where id::text like '70000000-0000-4000-8000-%'
on conflict (id) do update set access_mode = 'free';

create function pg_temp.pdf_user(n integer) returns uuid language sql immutable as $$
  select ('70000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create function pg_temp.pdf_request(n integer) returns uuid language sql immutable as $$
  select ('70000001-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create function pg_temp.reconcile_pdf(u integer, r integer, s text, provider text default null)
returns jsonb language sql as $$
  select public.reconcile_clinical_pdf_send(pg_temp.pdf_user(u), pg_temp.pdf_request(r),
    s, 'operador-local', 'Verificacion manual de operacion',
    'Evidencia local simulada: resultado verificado contra proveedor', provider);
$$;

select ok((select relrowsecurity from pg_class
  where oid = 'public.clinical_pdf_reconciliations'::regclass), 'Auditoria con RLS');
select ok(not has_table_privilege('authenticated', 'public.clinical_pdf_reconciliations', 'SELECT'), 'Evidencia no expuesta al cliente');
select ok(not has_table_privilege('authenticated', 'public.clinical_pdf_sends', 'UPDATE'), 'Cuenta no cambia reservas');
select ok(not has_table_privilege('service_role', 'public.clinical_pdf_reconciliations', 'UPDATE'), 'Servicio no edita auditoria directamente');
select ok(not has_table_privilege('service_role', 'public.clinical_pdf_reconciliations', 'DELETE'), 'Servicio no borra auditoria directamente');
select ok(has_table_privilege('service_role', 'public.clinical_pdf_reconciliations', 'SELECT'), 'Servicio consulta evidencia');
select ok(not has_function_privilege('authenticated',
  'public.reconcile_clinical_pdf_send(uuid,uuid,text,text,text,text,text)', 'EXECUTE'), 'Conciliacion no accesible al usuario');
select ok(not has_function_privilege('anon',
  'public.reconcile_clinical_pdf_send(uuid,uuid,text,text,text,text,text)', 'EXECUTE'), 'Conciliacion no accesible anon');
select ok(has_function_privilege('service_role',
  'public.reconcile_clinical_pdf_send(uuid,uuid,text,text,text,text,text)', 'EXECUTE'), 'Conciliacion exclusiva del servicio');
select ok((select prosecdef and proconfig @> array['search_path=public']
  from pg_proc where oid = 'public.reconcile_clinical_pdf_send(uuid,uuid,text,text,text,text,text)'::regprocedure),
  'Conciliacion SECURITY DEFINER con search_path fijo');

select public.reserve_clinical_pdf_send(pg_temp.pdf_user(1), pg_temp.pdf_request(1), repeat('a',64));
select public.transition_clinical_pdf_send(pg_temp.pdf_user(1), pg_temp.pdf_request(1), 'sending');
-- Simula evidencia persistida antes de un fallo posterior de confirmacion.
update public.clinical_pdf_sends set provider_id = 'resend-conocido'
  where user_id = pg_temp.pdf_user(1) and request_id = pg_temp.pdf_request(1);
select public.transition_clinical_pdf_send(pg_temp.pdf_user(1), pg_temp.pdf_request(1), 'uncertain', null);
select is((select provider_id from public.clinical_pdf_sends where user_id = pg_temp.pdf_user(1)
  and request_id = pg_temp.pdf_request(1)), 'resend-conocido', 'Un null posterior no elimina ID Resend');
select public.reserve_clinical_pdf_send(pg_temp.pdf_user(2), pg_temp.pdf_request(1), repeat('b',64));
select public.transition_clinical_pdf_send(pg_temp.pdf_user(2), pg_temp.pdf_request(1), 'sending');
select public.transition_clinical_pdf_send(pg_temp.pdf_user(2), pg_temp.pdf_request(1), 'uncertain');
select public.reserve_clinical_pdf_send(pg_temp.pdf_user(2), pg_temp.pdf_request(77), repeat('d',64));
select public.transition_clinical_pdf_send(pg_temp.pdf_user(2), pg_temp.pdf_request(77), 'sending');
select public.transition_clinical_pdf_send(pg_temp.pdf_user(2), pg_temp.pdf_request(77), 'uncertain');
update public.clinical_pdf_sends set created_at = now() - interval '100 days';

select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.pdf_user(1), 'role', 'authenticated')::text, true);
set local role authenticated;
select is(public.get_clinical_pdf_send_status(pg_temp.pdf_request(1))->>'status', 'uncertain', 'Cuenta recupera solo su operacion');
select is(jsonb_array_length(public.get_pending_clinical_pdf_sends()), 1, 'Lista propia no incluye segunda cuenta');
select is(public.get_clinical_pdf_send_status(pg_temp.pdf_request(99))->>'status', 'not_found', 'UUID desconocido no inventa reserva');
select is(public.get_clinical_pdf_send_status(pg_temp.pdf_request(77))->>'status', 'not_found', 'UUID ajeno no revela existencia ni estado');
select throws_ok($$select pg_temp.reconcile_pdf(1,1,'failed')$$, '42501', null, 'Usuario no libera ni su reserva');
select throws_ok($$select pg_temp.reconcile_pdf(2,1,'failed')$$, '42501', null, 'Usuario no modifica reserva ajena');
select throws_ok($$update public.clinical_pdf_sends set status='failed'$$, '42501', null, 'UPDATE directo denegado');
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.pdf_user(2),
  'role', 'authenticated', 'is_anonymous', true)::text, true);
set local role authenticated;
select throws_ok($$select public.get_pending_clinical_pdf_sends()$$, '42501', null, 'Auth anonima sin recuperacion');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select throws_ok($$select public.reconcile_clinical_pdf_send(pg_temp.pdf_user(1),pg_temp.pdf_request(1),
  'sent',null,'Motivo suficiente','Evidencia suficiente',null)$$, '22023', null, 'Actor obligatorio');
select throws_ok($$select public.reconcile_clinical_pdf_send(pg_temp.pdf_user(1),pg_temp.pdf_request(1),
  'sent','operador-local','Motivo suficiente','',null)$$, '22023', null, 'Evidencia obligatoria');
select throws_ok($$select public.reconcile_clinical_pdf_send(pg_temp.pdf_user(1),null,
  'sent','operador-local','Motivo suficiente','Evidencia suficiente',null)$$, '22023', null, 'UUID obligatorio');
select throws_ok($$select public.reconcile_clinical_pdf_send(pg_temp.pdf_user(1),pg_temp.pdf_request(1),
  'sent','operador-local','','Evidencia suficiente',null)$$, '22023', null, 'Motivo obligatorio');
select throws_ok($$select pg_temp.reconcile_pdf(1,1,'sending')$$, '22023', null, 'Solo resolucion terminal');
select throws_ok($$select pg_temp.reconcile_pdf(1,1,'sent','otro-id')$$, '22023', null, 'No se sobrescribe evidencia conocida');
select throws_ok($$select pg_temp.reconcile_pdf(1,1,'failed')$$, '22023', null, 'ID aceptado impide liberar cupo');
select throws_ok($$select pg_temp.reconcile_pdf(2,1,'sent')$$, '22023', null, 'Sent exige ID proveedor');
select is((select count(*)::integer from public.clinical_pdf_reconciliations), 0, 'Errores no generan auditoria parcial');
select is(pg_temp.reconcile_pdf(1,1,'sent')->>'status', 'sent', 'Conciliacion uncertain a sent sin reenvio');
select is((select provider_id from public.clinical_pdf_sends where user_id = pg_temp.pdf_user(1)
  and request_id = pg_temp.pdf_request(1)), 'resend-conocido', 'Confirmacion conserva ID');
select is((select actor from public.clinical_pdf_reconciliations where user_id = pg_temp.pdf_user(1)),
  'operador-local', 'Actor registrado');
select ok((select reconciled_at is not null and length(reason) >= 10 and length(evidence) >= 10
  and previous_status = 'uncertain' and resolved_status = 'sent'
  from public.clinical_pdf_reconciliations where user_id = pg_temp.pdf_user(1)),
  'Auditoria incluye fecha, estados, motivo y evidencia');
select throws_ok($$select pg_temp.reconcile_pdf(1,1,'failed')$$, '22023', null, 'No se reabre terminal');
select is((select status from public.clinical_pdf_sends where user_id = pg_temp.pdf_user(2)
  and request_id = pg_temp.pdf_request(1)), 'uncertain', 'Antiguedad no libera ni resuelve la reserva');
select is(pg_temp.reconcile_pdf(2,1,'failed')->>'status', 'failed', 'Ausencia confirmada de envio permite failed');
select is((select count(*)::integer from public.clinical_pdf_reconciliations), 2, 'Una auditoria por resolucion');
reset role;

-- Una baja de cuenta no debe impedir registrar evidencia administrativa.
update public.users set access_mode = 'free' where id = pg_temp.pdf_user(2);
select public.reserve_clinical_pdf_send(pg_temp.pdf_user(2), pg_temp.pdf_request(2), repeat('c',64));
select public.transition_clinical_pdf_send(pg_temp.pdf_user(2), pg_temp.pdf_request(2), 'sending');
select public.transition_clinical_pdf_send(pg_temp.pdf_user(2), pg_temp.pdf_request(2), 'uncertain');
update public.users set access_mode = 'guest' where id = pg_temp.pdf_user(2);
set local role service_role;
select is(pg_temp.reconcile_pdf(2,2,'sent','resend-posterior')->>'status', 'sent', 'Conciliacion independiente del plan actual');
reset role;

select * from finish();
rollback;
