-- 074: corrige la validacion de identidad al publicar candidatos del Radar.
-- La 073 exigia catalog_product_id = mla_id (modulo guiones), pero en Mercado
-- Libre son espacios de identificadores distintos: la ficha de catalogo
-- (products/MLA...) y la publicacion (items/MLA...) nunca coinciden, por lo que
-- ningun candidato de catalogo podia publicarse. La identidad se verifica ahora
-- atando la procedencia de la ficha investigada al endpoint oficial del
-- catalogo declarado o de la publicacion resuelta. El resto de la funcion es
-- identico a la 073.
begin;

create or replace function public.admin_review_shop_radar_safe(p_id uuid,p_action text,p_reason text,p_record jsonb default null,p_until timestamptz default null)
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
      or (v_row.catalog_product_id is not null and coalesce(v_row.research_record->'provenance'->'title'->>'source','')
          not in ('https://api.mercadolibre.com/products/'||v_row.catalog_product_id,
                  'https://api.mercadolibre.com/items/'||v_row.mla_id))
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
revoke all on function public.admin_review_shop_radar_safe(uuid,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_review_shop_radar_safe(uuid,text,text,jsonb,timestamptz) to authenticated;
commit;
