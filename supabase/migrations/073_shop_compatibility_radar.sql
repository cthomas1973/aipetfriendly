-- Preparada para revision. No activa procesos ni modifica productos existentes.
begin;

create table public.shop_compatibility_dimensions (
  product_id uuid not null references public.beneficios_productos(id) on delete cascade,
  dimension text not null check (dimension in ('species','stage','size')),
  values_text text[] not null,
  verification text not null check (verification in ('unknown','partial','conflict','confirmed')),
  source text not null,
  verified_at timestamptz not null,
  sku text not null,
  enabled boolean not null default false,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (product_id, dimension),
  check (cardinality(values_text)>0 and array_position(values_text,null) is null),
  check (length(trim(source))>0),
  check (sku ~ '^MLA[0-9]{6,}$'),
  check ((dimension='species' and values_text <@ array['perro','gato','otro']::text[])
      or (dimension='stage' and values_text <@ array['cachorro','adulto','senior','todas']::text[])
      or (dimension='size' and values_text <@ array['pequeño','mediano','grande','todos']::text[])),
  check (not enabled or verification='confirmed')
);
alter table public.shop_compatibility_dimensions enable row level security;
revoke all on public.shop_compatibility_dimensions from public,anon,authenticated;

create function public.invalidate_shop_dimensions()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.mla_id is distinct from old.mla_id or new.permalink is distinct from old.permalink
    or new.title is distinct from old.title or new.pet_types is distinct from old.pet_types
    or new.life_stages is distinct from old.life_stages or new.size_categories is distinct from old.size_categories then
    update public.shop_compatibility_dimensions set enabled=false,updated_at=now(),
      updated_by=coalesce(auth.uid(),updated_by) where product_id=new.id and enabled;
  end if;
  return new;
end $$;
revoke all on function public.invalidate_shop_dimensions() from public,anon,authenticated;
create trigger shop_dimensions_invalidate after update on public.beneficios_productos
  for each row execute function public.invalidate_shop_dimensions();

create function public.admin_shop_dimension(p_product uuid,p_dimension text,p_action text,
  p_values text[] default null,p_verification text default null,p_source text default null,
  p_verified_at timestamptz default null,p_sku text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_product public.beneficios_productos%rowtype; v_old public.shop_compatibility_dimensions%rowtype;
begin
  if not exists(select 1 from public.admin_users where user_id=auth.uid()) then
    raise exception 'No autorizado.' using errcode='42501';
  end if;
  if p_dimension is null or p_action is null or p_dimension not in ('species','stage','size') or p_action not in ('save','import','enable','disable') then
    raise exception 'Dimension o accion invalida.';
  end if;
  select * into v_product from public.beneficios_productos where id=p_product for update;
  if not found then raise exception 'Producto inexistente.'; end if;
  select * into v_old from public.shop_compatibility_dimensions where product_id=p_product and dimension=p_dimension for update;
  if p_action in ('save','import') then
    if p_action='import' and (p_values is null or cardinality(p_values)=0 or p_source is null or trim(p_source)='') then return; end if;
    if p_values is null or cardinality(p_values)=0 or p_verification not in ('unknown','partial','conflict','confirmed')
      or p_source is null or length(trim(p_source))=0 or p_verified_at is null
      or p_sku is null or p_sku !~ '^MLA[0-9]{6,}$'
      or (p_action='import' and (p_verification <> 'confirmed' or p_sku <> upper(replace(v_product.mla_id,'-','')))) then
      raise exception 'Valor, estado, fuente, fecha y SKU validos son obligatorios.';
    end if;
    if p_action='import' and found and v_old.values_text=p_values and v_old.verification=p_verification
      and v_old.source=trim(p_source) and v_old.verified_at=p_verified_at and v_old.sku=p_sku then return; end if;
    insert into public.shop_compatibility_dimensions(product_id,dimension,values_text,verification,source,verified_at,sku,enabled,updated_by)
    values(p_product,p_dimension,p_values,p_verification,trim(p_source),p_verified_at,p_sku,false,auth.uid())
    on conflict(product_id,dimension) do update set values_text=excluded.values_text,verification=excluded.verification,
      source=excluded.source,verified_at=excluded.verified_at,sku=excluded.sku,enabled=false,updated_by=auth.uid(),updated_at=now();
  elsif p_action='enable' then
    if v_old.product_id is null or v_old.verification<>'confirmed' or v_old.sku<>upper(replace(v_product.mla_id,'-','')) then
      raise exception 'Requiere valor confirmado, evidencia y SKU exacto.';
    end if;
    update public.shop_compatibility_dimensions set enabled=true,updated_by=auth.uid(),updated_at=now()
      where product_id=p_product and dimension=p_dimension;
  else
    update public.shop_compatibility_dimensions set enabled=false,updated_by=auth.uid(),updated_at=now()
      where product_id=p_product and dimension=p_dimension;
  end if;
end $$;

create function public.admin_get_shop_dimensions(p_product uuid)
returns setof public.shop_compatibility_dimensions language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.admin_users where user_id=auth.uid()) then
    raise exception 'No autorizado.' using errcode='42501';
  end if;
  return query select * from public.shop_compatibility_dimensions where product_id=p_product;
end $$;

create function public.get_shop_compatibility(p_products uuid[])
returns table(product_id uuid, dimensions jsonb) language sql stable security definer set search_path=public as $$
  select d.product_id,jsonb_object_agg(d.dimension,to_jsonb(d.values_text))
  from public.shop_compatibility_dimensions d
  join public.beneficios_productos p on p.id=d.product_id
  where d.product_id=any(p_products) and p.active and p.approval_status='approved'
    and d.enabled and d.verification='confirmed' and d.sku=upper(replace(p.mla_id,'-',''))
  group by d.product_id
  having count(*)=3
$$;
revoke all on function public.admin_shop_dimension(uuid,text,text,text[],text,text,timestamptz,text),
  public.admin_get_shop_dimensions(uuid),public.get_shop_compatibility(uuid[]) from public,anon,authenticated;
grant execute on function public.admin_shop_dimension(uuid,text,text,text[],text,text,timestamptz,text),
  public.admin_get_shop_dimensions(uuid) to authenticated;
grant execute on function public.get_shop_compatibility(uuid[]) to anon,authenticated,service_role;

create function public.admin_review_shop_radar_safe(p_id uuid,p_action text,p_reason text,p_record jsonb default null,p_until timestamptz default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_row public.shop_radar_candidates%rowtype; v_product uuid; v_record jsonb; v_group text;
begin
  if not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'No autorizado.' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 or p_action is null or p_action not in ('approve','publish','reject','postpone','revise','retry') then
    raise exception 'Decision y motivo obligatorios.';
  end if;
  select * into v_row from public.shop_radar_candidates where id=p_id for update;
  if not found or v_row.review_status='rejected' then raise exception 'Candidato inexistente o ya resuelto.'; end if;
  if v_row.research_status='researching' and v_row.lease_until>now() then raise exception 'Investigacion en curso.'; end if;
  if p_action='publish' then
    if v_row.review_status is distinct from 'approved' or v_row.reviewed_by is null or v_row.reviewed_at is null
      or v_row.duplicate_product_id is not null or v_row.listing_active is not true or v_row.research_status is distinct from 'ready'
      or v_row.researched_at is null or public.validate_shop_research(v_row.research_record) is not true
      or coalesce(v_row.mla_id,'') !~ '^MLA[0-9]{6,}$'
      or (v_row.catalog_product_id is not null and upper(replace(v_row.catalog_product_id,'-',''))<>upper(replace(v_row.mla_id,'-','')))
      or coalesce(v_row.research_record->>'permalink','') !~* ('^https://articulo[.]mercadolibre[.]com[.]ar/MLA-?' || substring(coalesce(v_row.mla_id,'') from 4) || '([^0-9]|$)')
      or length(trim(coalesce(v_row.research_record->>'title','')))=0
      or coalesce(v_row.research_record->>'category','') not in ('alimentos','juguetes','paseo','higiene','salud','entrenamiento','descanso','tecnologia') then
      raise exception 'Publicacion requiere identidad, ficha y aprobacion administrativa validas.';
    end if;
    perform pg_advisory_xact_lock(72002);
    if exists(select 1 from public.beneficios_productos where upper(replace(mla_id,'-',''))=v_row.mla_id
      or (v_row.catalog_product_id is not null and catalog_product_id=v_row.catalog_product_id)) then
      raise exception 'Producto ya incorporado al catalogo global.';
    end if;
    v_record:=v_row.research_record;
    v_group:=case when v_record->>'category' in ('paseo','entrenamiento') then 'accesorios'
      when v_record->>'category'='juguetes' then 'descanso' else v_record->>'category' end;
    insert into public.beneficios_productos(url_ml,mla_id,permalink,title,thumbnail,price,grupo,pet_types,life_stages,size_categories,
      free_shipping,fast_delivery,active,source,catalog_product_id,research_record,researched_at,approval_status)
    -- El esquema admite precio desconocido; no se inventa un precio comercial.
    values(v_record->>'permalink',v_row.mla_id,v_record->>'permalink',v_record->>'title',v_record->'images'->>0,null,v_group,
      array(select jsonb_array_elements_text(v_record->'petTypes')),array(select jsonb_array_elements_text(v_record->'lifeStages')),
      array(select jsonb_array_elements_text(v_record->'sizes')),false,false,true,'manual',v_row.catalog_product_id,v_record,
      v_row.researched_at,'approved') returning id into v_product;
    update public.shop_radar_candidates set duplicate_product_id=v_product where id=p_id;
  else
    if v_row.review_status='approved' then raise exception 'Candidato ya aprobado; publicar por accion independiente.'; end if;
    v_record:=coalesce(p_record,v_row.research_record);
    if p_action in ('approve','revise') and (v_row.research_status is distinct from 'ready' or public.validate_shop_research(v_record) is not true) then
      raise exception 'Requiere investigacion completa con fuentes.';
    end if;
    if p_action='approve' then
      if p_record is not null or v_row.listing_active is not true or v_row.duplicate_product_id is not null then
        raise exception 'Revision debe guardarse antes de aprobar; publicacion activa y no duplicada requerida.';
      end if;
      update public.shop_radar_candidates set review_status='approved' where id=p_id;
    elsif p_action='reject' then update public.shop_radar_candidates set review_status='rejected' where id=p_id;
    elsif p_action='postpone' then
      if p_until is null or p_until<=now() then raise exception 'Fecha futura obligatoria.'; end if;
      update public.shop_radar_candidates set review_status='postponed',postponed_until=p_until where id=p_id;
    elsif p_action='revise' then
      update public.shop_radar_candidates set research_record=v_record,researched_at=clock_timestamp() where id=p_id;
    elsif p_action='retry' then
      if v_row.research_status not in ('error','unsupported') then raise exception 'Solo se reintentan investigaciones fallidas.'; end if;
      update public.shop_radar_candidates set research_status='queued',research_error=null,lease_id=null,lease_until=null where id=p_id;
    end if;
  end if;
  update public.shop_radar_candidates set decision_reason=trim(p_reason),reviewed_by=auth.uid(),reviewed_at=clock_timestamp() where id=p_id;
  insert into public.shop_radar_events(candidate_id,actor_id,action,reason,snapshot)
    values(p_id,auth.uid(),p_action,trim(p_reason),jsonb_build_object('record',v_record,'until',p_until,'productId',v_product));
  return v_product;
end $$;
revoke all on function public.admin_review_shop_radar(uuid,text,text,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.admin_review_shop_radar_safe(uuid,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_review_shop_radar_safe(uuid,text,text,jsonb,timestamptz) to authenticated;
commit;
