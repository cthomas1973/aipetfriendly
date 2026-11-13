-- Preparada, no aplicada. Requiere beneficios_productos (014..017 y 066).
begin;

create table public.shop_price_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  active_hours integer not null default 24 check (active_hours between 24 and 168),
  frequent_hours integer not null default 6 check (frequent_hours between 6 and 24),
  batch_size integer not null default 20 check (batch_size between 1 and 20),
  retention_days integer not null default 365 check (retention_days between 30 and 730)
);
insert into public.shop_price_settings default values;

create table public.shop_tracked_products (
  product_id uuid primary key references public.beneficios_productos(id) on delete cascade,
  featured boolean not null default false,
  last_viewed_at timestamptz,
  price numeric(14,2) check (price > 0),
  regular_price numeric(14,2) check (regular_price > 0),
  promotional_price numeric(14,2) check (promotional_price > 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  series_started_at timestamptz,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  query_status text not null default 'untracked' check (query_status in ('untracked','ok','error')),
  error_code text,
  source text not null default 'mercadolibre_items_api',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  next_due_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  finished_lease_id uuid,
  finished_result jsonb,
  finished_changed boolean,
  failures integer not null default 0 check (failures >= 0)
);
create index shop_tracked_due_idx on public.shop_tracked_products(next_due_at, lease_until);

create table public.shop_price_samples (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.shop_tracked_products(product_id) on delete cascade,
  request_id uuid not null unique,
  price numeric(14,2) not null check (price > 0),
  previous_price numeric(14,2) check (previous_price > 0),
  regular_price numeric(14,2) check (regular_price > 0),
  promotional_price numeric(14,2) check (promotional_price > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  detected_at timestamptz not null default clock_timestamp(),
  source text not null default 'mercadolibre_items_api',
  query_status text not null default 'ok' check (query_status = 'ok')
);
create index shop_price_samples_product_idx on public.shop_price_samples(product_id, detected_at desc, id desc);

create table public.shop_provider_credentials (
  singleton boolean primary key default true check (singleton),
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  lease_id uuid,
  lease_until timestamptz,
  retry_at timestamptz
);

alter table public.shop_price_settings enable row level security;
alter table public.shop_tracked_products enable row level security;
alter table public.shop_price_samples enable row level security;
alter table public.shop_provider_credentials enable row level security;
revoke all on public.shop_price_settings, public.shop_tracked_products, public.shop_price_samples,
  public.shop_provider_credentials from public, anon, authenticated;
grant all on public.shop_price_settings, public.shop_tracked_products, public.shop_price_samples,
  public.shop_provider_credentials to service_role;
grant usage, select on sequence public.shop_price_samples_id_seq to service_role;

create function public.claim_shop_price_updates(p_limit integer default 20)
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
    'externalId',p.mla_id,'permalink',p.permalink)), '[]'::jsonb)
    into v_result from claimed c join public.beneficios_productos p on p.id=c.product_id;
  return v_result;
end $$;

create function public.finish_shop_price_update(p_product uuid, p_lease uuid, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row public.shop_tracked_products%rowtype;
  v_settings public.shop_price_settings%rowtype;
  v_price numeric(14,2); v_regular numeric(14,2); v_promo numeric(14,2); v_currency text;
  v_now timestamptz := clock_timestamp();
  v_changed boolean;
  v_interval integer;
begin
  select * into v_row from public.shop_tracked_products where product_id=p_product for update;
  if not found then raise exception 'Producto no reservado.'; end if;
  if p_lease is not null and v_row.finished_lease_id=p_lease then
    if v_row.finished_result is distinct from p_result then raise exception 'Resultado de consulta incompatible.' using errcode='22023'; end if;
    return jsonb_build_object('recorded',true,'changed',v_row.finished_changed,'replayed',true);
  end if;
  if p_lease is null or v_row.lease_id is distinct from p_lease or v_row.lease_until is null or v_row.lease_until <= v_now then
    raise exception 'Reserva vencida o incompatible.' using errcode='22023';
  end if;
  select * into v_settings from public.shop_price_settings where singleton;
  v_interval := case when v_row.featured or v_row.last_viewed_at > v_now-interval '7 days'
    then v_settings.frequent_hours else v_settings.active_hours end;
  if p_result->>'status' = 'ok' then
    v_price := (p_result->>'price')::numeric;
    v_regular := (p_result->>'regularPrice')::numeric;
    v_promo := (p_result->>'promotionalPrice')::numeric;
    v_currency := p_result->>'currency';
    if v_price is null or v_price <= 0 or v_currency is null or v_currency !~ '^[A-Z]{3}$'
      or (v_regular is not null and v_regular <= 0) or (v_promo is not null and v_promo <= 0)
      or jsonb_typeof(coalesce(p_result->'metadata','{}'::jsonb)) <> 'object' then
      raise exception 'Precio oficial invalido.' using errcode='22023';
    end if;
    v_changed := v_row.price is distinct from v_price or v_row.currency is distinct from v_currency;
    if v_changed then
      insert into public.shop_price_samples(product_id,request_id,price,previous_price,
        regular_price,promotional_price,currency,detected_at)
      values(p_product,p_lease,v_price,
        case when v_row.currency=v_currency then v_row.price else null end,
        v_regular,v_promo,v_currency,v_now);
    end if;
    update public.shop_tracked_products set price=v_price,regular_price=v_regular,
      promotional_price=v_promo,currency=v_currency,
      series_started_at=case when v_row.currency is distinct from v_currency then v_now else coalesce(series_started_at,v_now) end,
      last_success_at=v_now,query_status='ok',error_code=null,failures=0,
      metadata=coalesce(p_result->'metadata','{}'::jsonb),
      next_due_at=v_now+make_interval(hours=>v_interval),lease_id=null,lease_until=null
    where product_id=p_product;
  elsif p_result->>'status' = 'error' then
    update public.shop_tracked_products set query_status='error',
      error_code=left(coalesce(p_result->>'error','provider_unavailable'),100),
      failures=failures+1,
      next_due_at=v_now+make_interval(hours=>least(v_interval, power(2,least(failures,5))::integer)),
      lease_id=null,lease_until=null where product_id=p_product;
  else
    raise exception 'Estado de consulta invalido.' using errcode='22023';
  end if;
  update public.shop_tracked_products set finished_lease_id=p_lease,finished_result=p_result,
    finished_changed=coalesce(v_changed,false) where product_id=p_product;
  -- Retiene al menos cinco muestras, aunque sean anteriores al plazo.
  delete from public.shop_price_samples where product_id=p_product
    and detected_at < v_now-make_interval(days=>v_settings.retention_days)
    and id not in (select id from public.shop_price_samples where product_id=p_product order by detected_at desc,id desc limit 5);
  return jsonb_build_object('recorded',true,'changed',coalesce(v_changed,false));
end $$;

create function public.mark_shop_product_viewed(p_product uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_hours integer;
begin
  if not exists(select 1 from public.beneficios_productos where id=p_product and active) then
    raise exception 'Producto activo no encontrado.' using errcode='22023';
  end if;
  select frequent_hours into v_hours from public.shop_price_settings where singleton;
  insert into public.shop_tracked_products(product_id,last_viewed_at)
    values(p_product,now()) on conflict(product_id) do update
      set last_viewed_at=excluded.last_viewed_at,
      next_due_at=least(shop_tracked_products.next_due_at,
        coalesce(shop_tracked_products.last_attempt_at+make_interval(hours=>v_hours),shop_tracked_products.next_due_at))
      where shop_tracked_products.last_viewed_at is null or shop_tracked_products.last_viewed_at < now()-interval '1 hour';
end $$;

create function public.get_shop_price_history(p_products uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if p_products is null or cardinality(p_products) < 1 or cardinality(p_products) > 30 then
    raise exception 'Consulta de historial invalida (1..30 productos).' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId',p.id,'price',t.price,'regularPrice',t.regular_price,
    'promotionalPrice',t.promotional_price,'currency',t.currency,
    'lastSuccessAt',t.last_success_at,'lastAttemptAt',t.last_attempt_at,
    'status',coalesce(t.query_status,'untracked'),
    'error',case when t.query_status='error' then 'No pudimos actualizar el precio; se conserva la ultima consulta exitosa.' else null end,
    'minimum',(select min(s.price) from public.shop_price_samples s where s.product_id=p.id and s.currency=t.currency and s.detected_at>=t.series_started_at),
    'maximum',(select max(s.price) from public.shop_price_samples s where s.product_id=p.id and s.currency=t.currency and s.detected_at>=t.series_started_at),
    'changes',coalesce((select jsonb_agg(c.value order by c.detected_at desc,c.id desc) from (
      select s.id,s.detected_at,jsonb_build_object('detectedAt',s.detected_at,'previousPrice',s.previous_price,
        'price',s.price,'difference',s.price-s.previous_price,
        'percent',round((s.price-s.previous_price)/s.previous_price*100,2),
        'direction',case when s.price>s.previous_price then 'up' else 'down' end) as value
      from public.shop_price_samples s where s.product_id=p.id and s.previous_price is not null
        and s.currency=t.currency and s.detected_at>=t.series_started_at
      order by s.detected_at desc,s.id desc limit 4
    ) c),'[]'::jsonb)
  )), '[]'::jsonb) into v_result
  from public.beneficios_productos p left join public.shop_tracked_products t on t.product_id=p.id
  where p.active and p.id=any(p_products);
  return v_result;
end;
$$;

-- Un unico renovador de OAuth para API y worker; tokens nunca son publicos.
create function public.claim_shop_provider_token(p_seed text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.shop_provider_credentials%rowtype; v_lease uuid := gen_random_uuid();
begin
  if nullif(p_seed,'') is not null then
    insert into public.shop_provider_credentials(refresh_token) values(p_seed) on conflict do nothing;
  end if;
  select * into v_row from public.shop_provider_credentials where singleton for update;
  if not found then raise exception 'Credencial Mercado Libre no configurada.'; end if;
  if v_row.access_token is not null and v_row.expires_at > now()+interval '1 minute' then
    return jsonb_build_object('status','ready','accessToken',v_row.access_token);
  end if;
  if v_row.retry_at>now() or v_row.lease_until>now() then return jsonb_build_object('status','busy'); end if;
  update public.shop_provider_credentials set lease_id=v_lease,lease_until=now()+interval '2 minutes' where singleton;
  return jsonb_build_object('status','refresh','leaseId',v_lease,'refreshToken',v_row.refresh_token);
end $$;

create function public.finish_shop_provider_token(p_lease uuid,p_access text default null,p_refresh text default null,p_expires integer default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if nullif(p_access,'') is not null and (nullif(p_refresh,'') is null or p_expires is null or p_expires<=60 or p_expires>86400) then
    raise exception 'Respuesta OAuth invalida.' using errcode='22023';
  end if;
  update public.shop_provider_credentials set
    access_token=case when nullif(p_access,'') is not null then p_access else access_token end,
    refresh_token=case when nullif(p_refresh,'') is not null then p_refresh else refresh_token end,
    expires_at=case when nullif(p_access,'') is not null and p_expires>60 then now()+make_interval(secs=>p_expires) else expires_at end,
    retry_at=case when nullif(p_access,'') is null then now()+interval '10 minutes' else null end,
    lease_id=null,lease_until=null
  where singleton and lease_id=p_lease and lease_until>now();
  if not found then raise exception 'Reserva OAuth invalida.'; end if;
end $$;

revoke all on function public.claim_shop_price_updates(integer), public.finish_shop_price_update(uuid,uuid,jsonb),
  public.claim_shop_provider_token(text),public.finish_shop_provider_token(uuid,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.claim_shop_price_updates(integer),public.finish_shop_price_update(uuid,uuid,jsonb),
  public.claim_shop_provider_token(text),public.finish_shop_provider_token(uuid,text,text,integer) to service_role;
revoke all on function public.get_shop_price_history(uuid[]),public.mark_shop_product_viewed(uuid) from public;
grant execute on function public.get_shop_price_history(uuid[]),public.mark_shop_product_viewed(uuid) to anon,authenticated,service_role;

commit;
