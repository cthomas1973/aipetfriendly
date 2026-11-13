-- Preparada, no aplicada. Requiere 066 y 071; no modifica migraciones anteriores.
begin;

alter table public.beneficios_productos
  add column catalog_product_id text,
  add column research_record jsonb not null default '{}'::jsonb,
  add column researched_at timestamptz,
  add column approval_status text not null default 'approved'
    check (approval_status in ('pending','approved','rejected'));
alter table public.beneficios_productos add constraint shop_research_object check (jsonb_typeof(research_record)='object');
-- Conserva aprobacion de productos ya publicados; los nuevos quedan pendientes por defecto.
alter table public.beneficios_productos alter column approval_status set default 'pending';
-- No fusiona ni elimina duplicados previos: si existen, falla para revision manual.
create unique index shop_global_mla_unique on public.beneficios_productos(upper(replace(mla_id,'-','')));
create unique index shop_global_catalog_unique on public.beneficios_productos(catalog_product_id) where catalog_product_id is not null;

create table public.shop_radar_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  research_enabled boolean not null default false
);
insert into public.shop_radar_settings default values;
create table public.shop_radar_runs (
  run_day date primary key,
  id uuid not null unique default gen_random_uuid(),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  detected_count integer not null default 0 check (detected_count between 0 and 5),
  category_cursor integer not null default 0,
  limitations jsonb not null default '[]'::jsonb check (jsonb_typeof(limitations)='array')
);
create table public.shop_radar_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.shop_radar_runs(id),
  mla_id text,
  catalog_product_id text,
  category_id text not null,
  category_name text not null,
  detected_at timestamptz not null default clock_timestamp(),
  detection_source text not null,
  ranking_position integer check (ranking_position > 0),
  discovery jsonb not null default '{}'::jsonb,
  duplicate_product_id uuid references public.beneficios_productos(id) on delete set null,
  research_status text not null default 'queued' check (research_status in ('queued','researching','ready','error','unsupported')),
  research_record jsonb not null default '{}'::jsonb check (jsonb_typeof(research_record)='object'),
  researched_at timestamptz,
  research_error text,
  listing_active boolean not null default false,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected','postponed')),
  decision_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  postponed_until timestamptz,
  lease_id uuid,
  lease_until timestamptz,
  finished_lease_id uuid,
  finished_result jsonb,
  check (mla_id is not null or catalog_product_id is not null),
  check (mla_id is null or mla_id ~ '^MLA[0-9]{6,}$'),
  check (catalog_product_id is null or catalog_product_id ~ '^MLA[0-9]{6,}$')
);
create unique index shop_radar_item_unique on public.shop_radar_candidates(mla_id) where mla_id is not null;
create unique index shop_radar_catalog_unique on public.shop_radar_candidates(catalog_product_id) where catalog_product_id is not null;
create table public.shop_radar_events (
  id bigint generated always as identity primary key,
  candidate_id uuid not null references public.shop_radar_candidates(id),
  event_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  action text not null,
  reason text,
  snapshot jsonb not null default '{}'::jsonb
);

alter table public.shop_radar_settings enable row level security;
alter table public.shop_radar_runs enable row level security;
alter table public.shop_radar_candidates enable row level security;
alter table public.shop_radar_events enable row level security;
revoke all on public.shop_radar_settings,public.shop_radar_runs,public.shop_radar_candidates,public.shop_radar_events from public,anon,authenticated;
grant all on public.shop_radar_settings,public.shop_radar_runs,public.shop_radar_candidates,public.shop_radar_events to service_role;
grant usage,select on sequence public.shop_radar_events_id_seq to service_role;

create function public.claim_shop_radar_run()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_run public.shop_radar_runs%rowtype; v_cursor integer;
begin
  if not (select enabled from public.shop_radar_settings where singleton) then return jsonb_build_object('status','disabled'); end if;
  perform pg_advisory_xact_lock(72001);
  if exists(select 1 from public.shop_radar_runs where run_day=(now() at time zone 'America/Argentina/Buenos_Aires')::date) then
    return jsonb_build_object('status','already_ran');
  end if;
  select coalesce(max(category_cursor)+5,0) into v_cursor from public.shop_radar_runs;
  insert into public.shop_radar_runs(run_day,category_cursor)
    values((now() at time zone 'America/Argentina/Buenos_Aires')::date,v_cursor) returning * into v_run;
  return jsonb_build_object('status','claimed','runId',v_run.id,'cursor',v_cursor);
end $$;

create function public.record_shop_radar_detection(p_run uuid,p_detection jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_run public.shop_radar_runs%rowtype; v_existing uuid; v_product uuid; v_id uuid;
  v_mla text:=nullif(p_detection->>'mlaId',''); v_catalog text:=nullif(p_detection->>'catalogProductId','');
begin
  select * into v_run from public.shop_radar_runs where id=p_run for update;
  if not found or v_run.finished_at is not null or v_run.run_day<>(now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'Ejecucion Radar invalida.' using errcode='22023';
  end if;
  if (v_mla is null and v_catalog is null) or (v_mla is not null and v_mla!~'^MLA[0-9]{6,}$')
    or (v_catalog is not null and v_catalog!~'^MLA[0-9]{6,}$')
    or coalesce(p_detection->>'source','')!~'^https://api\.mercadolibre\.com/highlights/MLA/category/MLA[0-9]+$'
    or coalesce(p_detection->>'categoryId','')!~'^MLA[0-9]+$' then raise exception 'Deteccion invalida.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(72002);
  select id into v_existing from public.shop_radar_candidates
    where mla_id=v_mla or catalog_product_id=v_catalog limit 1;
  if found then return jsonb_build_object('status','already_known','candidateId',v_existing); end if;
  if v_run.detected_count>=5 then return jsonb_build_object('status','daily_limit'); end if;
  select id into v_product from public.beneficios_productos
    where upper(replace(mla_id,'-',''))=v_mla or catalog_product_id=v_catalog
      or (v_catalog is not null and permalink like '%/p/'||v_catalog||'%') limit 1;
  insert into public.shop_radar_candidates(run_id,mla_id,catalog_product_id,category_id,category_name,detection_source,
    ranking_position,discovery,duplicate_product_id,research_status,review_status,decision_reason)
  values(p_run,v_mla,v_catalog,p_detection->>'categoryId',coalesce(p_detection->>'categoryName','No informado'),
    p_detection->>'source',(p_detection->>'position')::integer,p_detection,v_product,
    case when v_product is not null then 'unsupported' else 'queued' end,
    case when v_product is not null then 'rejected' else 'pending' end,
    case when v_product is not null then 'Ya existe en el catalogo global.' else null end)
  returning id into v_id;
  update public.shop_radar_runs set detected_count=detected_count+1 where id=p_run;
  insert into public.shop_radar_events(candidate_id,action,reason,snapshot)
    values(v_id,'detected',case when v_product is not null then 'Duplicado global; no investigar.' end,p_detection);
  return jsonb_build_object('status',case when v_product is null then 'created' else 'duplicate' end,'candidateId',v_id);
end $$;

create function public.finish_shop_radar_run(p_run uuid,p_limitations jsonb default '[]')
returns void language plpgsql security definer set search_path=public as $$
begin
  if jsonb_typeof(p_limitations)<>'array' then raise exception 'Limitaciones invalidas.'; end if;
  update public.shop_radar_runs set finished_at=clock_timestamp(),limitations=p_limitations where id=p_run and finished_at is null;
  if not found then raise exception 'Ejecucion Radar ya finalizada o inexistente.'; end if;
end $$;

create function public.claim_shop_radar_research(p_limit integer default 5)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
  if not (select research_enabled from public.shop_radar_settings where singleton) then return '[]'; end if;
  with candidates as (
    select id from public.shop_radar_candidates where review_status in ('pending','postponed')
      and (postponed_until is null or postponed_until<=now()) and duplicate_product_id is null
      and (research_status='queued' or (research_status='researching' and lease_until<=now()))
    order by detected_at,id limit least(greatest(coalesce(p_limit,1),1),5) for update skip locked
  ), leased as (
    update public.shop_radar_candidates c set research_status='researching',lease_id=gen_random_uuid(),
      lease_until=now()+interval '5 minutes' from candidates q where c.id=q.id
    returning c.id,c.mla_id,c.catalog_product_id,c.lease_id,c.category_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'mlaId',mla_id,'catalogProductId',catalog_product_id,
    'leaseId',lease_id,'categoryId',category_id)),'[]') into v_result from leased;
  return v_result;
end $$;

create function public.validate_shop_research(p_record jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare v_field text; v_source jsonb; v_attr jsonb;
begin
  if jsonb_typeof(p_record)<>'object' or length(coalesce(p_record->>'title',''))=0
    or coalesce(p_record->>'permalink','')!~'^https://(articulo\.mercadolibre\.com\.ar|www\.mercadolibre\.com\.ar)/'
    or coalesce(p_record->>'category','') not in ('alimentos','juguetes','paseo','higiene','salud','entrenamiento','descanso','tecnologia')
    or jsonb_typeof(p_record->'provenance') is distinct from 'object' then return false; end if;
  foreach v_field in array array['petTypes','lifeStages','sizes','images','attributes','limitations'] loop
    if jsonb_typeof(p_record->v_field) is distinct from 'array' then return false; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements_text(p_record->'petTypes') v where v not in ('perro','gato','otro'))
    or exists(select 1 from jsonb_array_elements_text(p_record->'lifeStages') v where v not in ('cachorro','adulto','senior','todas'))
    or exists(select 1 from jsonb_array_elements_text(p_record->'sizes') v where v not in ('pequeño','mediano','grande','todos'))
    then return false; end if;
  foreach v_field in array array['title','permalink','description','brand','images','category','petTypes','lifeStages','sizes'] loop
    if p_record->v_field is not null and p_record->v_field<>'null'::jsonb and p_record->v_field<>'[]'::jsonb then
      v_source:=p_record->'provenance'->v_field;
      if jsonb_typeof(v_source) is distinct from 'object' or length(coalesce(v_source->>'source',''))=0
        or coalesce(v_source->>'researchedAt','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then return false; end if;
      perform (v_source->>'researchedAt')::timestamptz;
    end if;
  end loop;
  for v_attr in select value from jsonb_array_elements(p_record->'attributes') loop
    if length(coalesce(v_attr->>'name',''))=0 or length(coalesce(v_attr->>'value',''))=0
      or length(coalesce(v_attr->>'source',''))=0 then return false; end if;
    perform (v_attr->>'researchedAt')::timestamptz;
    if v_attr->>'researchedAt' is null then return false; end if;
  end loop;
  return true;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;

create function public.finish_shop_radar_research(p_id uuid,p_lease uuid,p_result jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_row public.shop_radar_candidates%rowtype; v_mla text; v_catalog text; v_duplicate uuid;
begin
  select * into v_row from public.shop_radar_candidates where id=p_id for update;
  if not found then raise exception 'Candidato inexistente.'; end if;
  if v_row.finished_lease_id=p_lease and p_lease is not null then
    if v_row.finished_result is distinct from p_result then raise exception 'Resultado incompatible.'; end if;
    return;
  end if;
  if p_lease is null or v_row.lease_id is distinct from p_lease or v_row.lease_until<=clock_timestamp()
    or v_row.review_status not in ('pending','postponed') then raise exception 'Reserva invalida.'; end if;
  if p_result->>'status'='ready' then
    if not public.validate_shop_research(p_result->'record') or p_result->>'listingActive' is distinct from 'true' then
      raise exception 'Investigacion incompleta.' using errcode='22023';
    end if;
    v_mla:=p_result->>'mlaId'; v_catalog:=nullif(p_result->>'catalogProductId','');
    if v_mla is null or v_mla!~'^MLA[0-9]{6,}$' or (v_row.mla_id is not null and v_row.mla_id<>v_mla)
      or (v_row.catalog_product_id is not null and v_row.catalog_product_id is distinct from v_catalog) then
      raise exception 'Identidad de publicacion incompatible.';
    end if;
    perform pg_advisory_xact_lock(72002);
    select id into v_duplicate from public.beneficios_productos where upper(replace(mla_id,'-',''))=v_mla or catalog_product_id=v_catalog limit 1;
    if exists(select 1 from public.shop_radar_candidates where id<>p_id and (mla_id=v_mla or catalog_product_id=v_catalog)) then
      update public.shop_radar_candidates set research_status='unsupported',review_status='rejected',
        research_error='Otra deteccion ya representa esta publicacion o catalogo.',decision_reason='Duplicado en Radar.'
        where id=p_id;
    else
      update public.shop_radar_candidates set mla_id=v_mla,catalog_product_id=v_catalog,research_status='ready',
        research_record=p_result->'record',researched_at=clock_timestamp(),research_error=null,
        listing_active=true,duplicate_product_id=v_duplicate,
        review_status=case when v_duplicate is null then review_status else 'rejected' end,
        decision_reason=case when v_duplicate is not null then 'Duplicado global; no incorporar.' else decision_reason end where id=p_id;
    end if;
  elsif p_result->>'status' in ('error','unsupported') then
    update public.shop_radar_candidates set research_status=p_result->>'status',research_error=left(p_result->>'error',200) where id=p_id;
  else raise exception 'Estado de investigacion invalido.'; end if;
  update public.shop_radar_candidates set lease_id=null,lease_until=null,finished_lease_id=p_lease,finished_result=p_result where id=p_id;
  insert into public.shop_radar_events(candidate_id,action,snapshot) values(p_id,'researched',p_result);
end $$;

create function public.admin_list_shop_radar(p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'No autorizado.' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 then raise exception 'Pagina invalida.'; end if;
  return jsonb_build_object('candidates',(select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from public.shop_radar_events e where e.candidate_id=c.id)
  ) order by c.detected_at desc),'[]') from (select * from public.shop_radar_candidates order by detected_at desc,id limit 100 offset p_offset) c),
  'total',(select count(*) from public.shop_radar_candidates),
  'runs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.run_day desc),'[]') from (select * from public.shop_radar_runs order by run_day desc limit 14) r));
end $$;

create function public.admin_review_shop_radar(p_id uuid,p_action text,p_reason text,p_record jsonb default null,p_until timestamptz default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_row public.shop_radar_candidates%rowtype; v_product uuid; v_record jsonb; v_group text;
begin
  if not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'No autorizado.' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 or p_action not in ('approve','reject','postpone','revise','retry') then raise exception 'Decision y motivo obligatorios.'; end if;
  select * into v_row from public.shop_radar_candidates where id=p_id for update;
  if not found or v_row.review_status in ('approved','rejected') then raise exception 'Candidato inexistente o ya resuelto.'; end if;
  if v_row.research_status='researching' and v_row.lease_until>now() then raise exception 'Investigacion en curso; esperar su finalizacion.'; end if;
  v_record:=coalesce(p_record,v_row.research_record);
  if p_action in ('approve','revise') and (v_row.research_status<>'ready' or not public.validate_shop_research(v_record)) then
    raise exception 'Requiere investigacion completa con fuentes.'; end if;
  if p_action='approve' then
    if not v_row.listing_active or v_row.duplicate_product_id is not null then raise exception 'Publicacion inactiva o duplicada.'; end if;
    perform pg_advisory_xact_lock(72002);
    if exists(select 1 from public.beneficios_productos where upper(replace(mla_id,'-',''))=v_row.mla_id or catalog_product_id=v_row.catalog_product_id) then
      raise exception 'Producto ya incorporado al catalogo global.';
    end if;
    v_group:=case when v_record->>'category' in ('paseo','entrenamiento') then 'accesorios'
      when v_record->>'category'='juguetes' then 'descanso' else v_record->>'category' end;
    insert into public.beneficios_productos(url_ml,mla_id,permalink,title,thumbnail,price,grupo,pet_types,life_stages,size_categories,
      free_shipping,fast_delivery,active,source,catalog_product_id,research_record,researched_at,approval_status)
    values(v_record->>'permalink',v_row.mla_id,v_record->>'permalink',v_record->>'title',v_record->'images'->>0,null,v_group,
      array(select jsonb_array_elements_text(v_record->'petTypes')),array(select jsonb_array_elements_text(v_record->'lifeStages')),
      array(select jsonb_array_elements_text(v_record->'sizes')),false,false,true,'manual',v_row.catalog_product_id,v_record,
      v_row.researched_at,'approved') returning id into v_product;
    update public.shop_radar_candidates set review_status='approved',duplicate_product_id=v_product where id=p_id;
  elsif p_action='reject' then
    update public.shop_radar_candidates set review_status='rejected' where id=p_id;
  elsif p_action='postpone' then
    if p_until is null or p_until<=now() then raise exception 'Fecha futura obligatoria.'; end if;
    update public.shop_radar_candidates set review_status='postponed',postponed_until=p_until where id=p_id;
  elsif p_action='revise' then
    update public.shop_radar_candidates set research_record=v_record,researched_at=clock_timestamp() where id=p_id;
  elsif p_action='retry' then
    if v_row.research_status not in ('error','unsupported') then raise exception 'Solo se reintentan investigaciones fallidas.'; end if;
    update public.shop_radar_candidates set research_status='queued',research_error=null,lease_id=null,lease_until=null where id=p_id;
  end if;
  update public.shop_radar_candidates set decision_reason=trim(p_reason),reviewed_by=auth.uid(),reviewed_at=clock_timestamp() where id=p_id;
  insert into public.shop_radar_events(candidate_id,actor_id,action,reason,snapshot)
    values(p_id,auth.uid(),p_action,trim(p_reason),jsonb_build_object('record',v_record,'until',p_until,'productId',v_product));
  return v_product;
end $$;

-- La aprobacion es una barrera adicional al flag active, tambien para lecturas RLS existentes.
create policy "Shop approved catalog guard" on public.beneficios_productos as restrictive for select to public
  using (approval_status='approved' or exists(select 1 from public.admin_users where user_id=auth.uid()));

-- Actualizaciones administrativas explicitas conservan procedencia; precios no disparan investigacion.
create function public.guard_shop_global_research()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.research_record<>'{}'::jsonb and not public.validate_shop_research(new.research_record) then
    raise exception 'Ficha global invalida; requiere fuentes y fechas.';
  end if;
  if tg_op='UPDATE' and (new.pet_types is distinct from old.pet_types or new.life_stages is distinct from old.life_stages
    or new.size_categories is distinct from old.size_categories or new.title is distinct from old.title
    or new.permalink is distinct from old.permalink or new.thumbnail is distinct from old.thumbnail or new.grupo is distinct from old.grupo)
    and new.research_record is not distinct from old.research_record then
    -- Conserva la ficha previa como referencia, pero ya no certifica etiquetas editadas.
    new.researched_at:=null;
  end if;
  if new.researched_at is not null and (new.research_record='{}'::jsonb
    or new.title is distinct from new.research_record->>'title'
    or new.permalink is distinct from new.research_record->>'permalink'
    or to_jsonb(new.pet_types) is distinct from new.research_record->'petTypes'
    or to_jsonb(new.life_stages) is distinct from new.research_record->'lifeStages'
    or to_jsonb(new.size_categories) is distinct from new.research_record->'sizes') then
    raise exception 'Ficha investigada y atributos globales inconsistentes.';
  end if;
  if new.approval_status<>'approved' then new.active:=false; end if;
  return new;
end $$;
create trigger shop_global_research_guard before insert or update on public.beneficios_productos
  for each row execute function public.guard_shop_global_research();

revoke all on function public.claim_shop_radar_run(),public.record_shop_radar_detection(uuid,jsonb),
 public.finish_shop_radar_run(uuid,jsonb),public.claim_shop_radar_research(integer),
 public.finish_shop_radar_research(uuid,uuid,jsonb),public.validate_shop_research(jsonb),public.guard_shop_global_research()
 from public,anon,authenticated;
grant execute on function public.claim_shop_radar_run(),public.record_shop_radar_detection(uuid,jsonb),
 public.finish_shop_radar_run(uuid,jsonb),public.claim_shop_radar_research(integer),public.finish_shop_radar_research(uuid,uuid,jsonb)
 to service_role;
revoke all on function public.admin_list_shop_radar(integer),public.admin_review_shop_radar(uuid,text,text,jsonb,timestamptz) from public,anon;
grant execute on function public.admin_list_shop_radar(integer),public.admin_review_shop_radar(uuid,text,text,jsonb,timestamptz) to authenticated;
commit;
