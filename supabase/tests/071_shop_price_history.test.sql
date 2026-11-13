-- Solo PostgreSQL local desechable. No ejecutar en produccion.
begin;
insert into public.beneficios_productos(id,mla_id,permalink,title,active,grupo)
values
 ('71000000-0000-4000-8000-000000000001','MLA1234567890','https://articulo.mercadolibre.com.ar/MLA-1234567890','Producto de prueba',true,'alimentos'),
 ('71000000-0000-4000-8000-000000000002','MLA1234567891','https://articulo.mercadolibre.com.ar/MLA-1234567891','Inactivo de prueba',false,'alimentos');
update public.shop_price_settings set enabled=true;

create function pg_temp.shop_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception '%',p_message; end if; end $$;

create function pg_temp.shop_observe(p_price numeric,p_currency text default 'ARS',p_regular numeric default null)
returns jsonb language plpgsql as $$
declare v_job jsonb; v_result jsonb;
begin
  update public.shop_tracked_products set next_due_at=now()-interval '1 minute'
    where product_id='71000000-0000-4000-8000-000000000001';
  v_job := public.claim_shop_price_updates(20)->0;
  perform pg_temp.shop_assert(v_job is not null,'Debe reservar el producto activo.');
  v_result := jsonb_build_object('status','ok','price',p_price,'currency',p_currency,
    'regularPrice',p_regular,'promotionalPrice',case when p_regular>p_price then p_price else null end);
  return public.finish_shop_price_update((v_job->>'productId')::uuid,(v_job->>'leaseId')::uuid,v_result);
end $$;

select pg_temp.shop_assert(not has_table_privilege('anon','public.shop_provider_credentials','SELECT'),'Tokens privados');
select pg_temp.shop_assert(not has_table_privilege('authenticated','public.shop_price_samples','INSERT'),'Cliente no altera precios');
select pg_temp.shop_assert(not has_function_privilege('authenticated','public.claim_shop_price_updates(integer)','EXECUTE'),'Reservas solo servidor');
select pg_temp.shop_assert(not has_function_privilege('anon','public.finish_shop_price_update(uuid,uuid,jsonb)','EXECUTE'),'Finalizacion solo servidor');
select pg_temp.shop_assert(has_function_privilege('anon','public.get_shop_price_history(uuid[])','EXECUTE'),'Historial publico seguro');
select pg_temp.shop_assert((select bool_and(relrowsecurity) from pg_class where relname in ('shop_tracked_products','shop_price_samples','shop_provider_credentials','shop_price_settings')),'RLS en todas las tablas');

do $$
declare v_jobs jsonb; v_job jsonb; v_result jsonb; v_lease uuid;
begin
  v_jobs := public.claim_shop_price_updates(20);
  perform pg_temp.shop_assert(jsonb_array_length(v_jobs)=1,'Solo productos activos.');
  perform pg_temp.shop_assert(public.claim_shop_price_updates(20)='[]'::jsonb,'Otra reserva no duplica el trabajo.');
  v_job:=v_jobs->0; v_lease:=(v_job->>'leaseId')::uuid;
  v_result:='{"status":"ok","price":100,"currency":"ARS","regularPrice":120,"promotionalPrice":100}'::jsonb;
  perform public.finish_shop_price_update((v_job->>'productId')::uuid,v_lease,v_result);
  perform pg_temp.shop_assert((public.finish_shop_price_update((v_job->>'productId')::uuid,v_lease,v_result)->>'replayed')::boolean,'Finalizacion idempotente.');
  begin
    perform public.finish_shop_price_update((v_job->>'productId')::uuid,v_lease,jsonb_set(v_result,'{price}','101'));
    raise exception 'No se rechazo resultado incompatible.';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.finish_shop_price_update((v_job->>'productId')::uuid,null,v_result);
    raise exception 'No se rechazo reserva nula.';
  exception when sqlstate '22023' then null; end;
end $$;

select pg_temp.shop_assert((select count(*)=1 from public.shop_price_samples),'Primera consulta es baseline, no variacion.');
select pg_temp.shop_assert(public.get_shop_price_history(array['71000000-0000-4000-8000-000000000001'::uuid])->0->'changes'='[]'::jsonb,'Baseline sin cambios ficticios.');
select pg_temp.shop_observe(100,'ARS',130);
select pg_temp.shop_assert((select count(*)=1 from public.shop_price_samples),'Precio igual y regular distinto no crea variacion.');
select pg_temp.shop_assert((select regular_price=130 and promotional_price=100 from public.shop_tracked_products),'Promocion y regular diferenciados.');
select pg_temp.shop_observe(110);
select pg_temp.shop_observe(90);
select pg_temp.shop_observe(95);
select pg_temp.shop_observe(105);
select pg_temp.shop_observe(80);
select pg_temp.shop_assert(jsonb_array_length(public.get_shop_price_history(array['71000000-0000-4000-8000-000000000001'::uuid])->0->'changes')=4,'Solo cuatro variaciones visibles aunque haya cinco.');
select pg_temp.shop_assert((public.get_shop_price_history(array['71000000-0000-4000-8000-000000000001'::uuid])->0->'changes'->0->>'direction')='down','Ultima variacion es disminucion.');
select pg_temp.shop_assert((public.get_shop_price_history(array['71000000-0000-4000-8000-000000000001'::uuid])->0->>'minimum')::numeric=80,'Minimo real.');
select pg_temp.shop_assert((public.get_shop_price_history(array['71000000-0000-4000-8000-000000000001'::uuid])->0->>'maximum')::numeric=110,'Maximo real.');

do $$
declare v_job jsonb; v_success timestamptz;
begin
  select last_success_at into v_success from public.shop_tracked_products;
  update public.shop_tracked_products set next_due_at=now()-interval '1 minute';
  v_job:=public.claim_shop_price_updates(20)->0;
  perform public.finish_shop_price_update((v_job->>'productId')::uuid,(v_job->>'leaseId')::uuid,'{"status":"error","error":"http_403"}');
  perform pg_temp.shop_assert((select price=80 and last_success_at=v_success and query_status='error' from public.shop_tracked_products),'Error conserva precio y fecha exitosa.');
end $$;
select pg_temp.shop_observe(10,'USD');
select pg_temp.shop_assert(public.get_shop_price_history(array['71000000-0000-4000-8000-000000000001'::uuid])->0->'changes'='[]'::jsonb,'Cambio de moneda inicia serie, no porcentaje falso.');
select pg_temp.shop_assert((public.get_shop_price_history(array['71000000-0000-4000-8000-000000000001'::uuid])->0->>'minimum')::numeric=10,'Minimo en moneda nueva.');
select pg_temp.shop_assert(public.get_shop_price_history(array['71000000-0000-4000-8000-000000000002'::uuid])='[]'::jsonb,'No filtra productos inactivos al publico.');
set local role anon;
select public.get_shop_price_history(array['71000000-0000-4000-8000-000000000001'::uuid]);
do $$
begin
  begin
    perform 1 from public.shop_provider_credentials;
    raise exception 'Anon pudo leer credenciales.';
  exception when insufficient_privilege then null; end;
  begin
    update public.shop_tracked_products set price=1;
    raise exception 'Anon pudo alterar precios.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select public.mark_shop_product_viewed('71000000-0000-4000-8000-000000000001');
select pg_temp.shop_assert((select next_due_at>=last_attempt_at+interval '6 hours' from public.shop_tracked_products),'Visita no permite consultas ilimitadas.');

do $$
declare v_claim jsonb;
begin
  v_claim:=public.claim_shop_provider_token('token-sintetico');
  perform pg_temp.shop_assert(v_claim->>'status'='refresh','Primer renovador OAuth.');
  perform pg_temp.shop_assert(public.claim_shop_provider_token('token-sintetico')->>'status'='busy','Renovacion concurrente bloqueada.');
  perform public.finish_shop_provider_token((v_claim->>'leaseId')::uuid,'access-sintetico','refresh-rotado-sintetico',3600);
  perform pg_temp.shop_assert(public.claim_shop_provider_token('token-antiguo')->>'status'='ready','Reutiliza token vigente.');
  perform pg_temp.shop_assert((select refresh_token='refresh-rotado-sintetico' from public.shop_provider_credentials),'No pisa refresh rotado con seed antiguo.');
end $$;

rollback;
