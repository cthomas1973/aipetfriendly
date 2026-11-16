-- 075: el reclamo de actualizaciones de precio informa tambien el catalogo ML.
-- Mercado Libre deniega GET /items/{id} sobre publicaciones de terceros
-- (access_denied, verificado el 2026-11-16), pero expone el precio real de
-- cada publicacion en GET /products/{catalog}/items. Para poder consultar esa
-- fuente oficial, claim_shop_price_updates devuelve ademas catalogProductId.
-- Campo aditivo: no cambia firmas ni el resto del flujo.
begin;

create or replace function public.claim_shop_price_updates(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_settings public.shop_price_settings%rowtype;
  v_result jsonb;
begin
  select * into v_settings from public.shop_price_settings where singleton;
  if not v_settings.enabled then return '[]'::jsonb; end if;
  insert into public.shop_tracked_products(product_id)
    select id from public.beneficios_productos where active
    on conflict do nothing;
  with candidates as (
    select t.product_id from public.shop_tracked_products t
    join public.beneficios_productos p on p.id=t.product_id and p.active
    where t.next_due_at <= now() and (t.lease_until is null or t.lease_until <= now())
    order by t.next_due_at, t.product_id
    limit least(greatest(coalesce(p_limit,1),1),v_settings.batch_size)
    for update of t skip locked
  ), claimed as (
    update public.shop_tracked_products t set lease_id=gen_random_uuid(),
      lease_until=now()+interval '5 minutes', last_attempt_at=clock_timestamp()
    from candidates c where t.product_id=c.product_id
    returning t.product_id,t.lease_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('productId',c.product_id,'leaseId',c.lease_id,
    'externalId',p.mla_id,'permalink',p.permalink,'catalogProductId',p.catalog_product_id)), '[]'::jsonb)
    into v_result from claimed c join public.beneficios_productos p on p.id=c.product_id;
  return v_result;
end $$;

revoke all on function public.claim_shop_price_updates(integer) from public,anon,authenticated;
grant execute on function public.claim_shop_price_updates(integer) to service_role;
commit;
