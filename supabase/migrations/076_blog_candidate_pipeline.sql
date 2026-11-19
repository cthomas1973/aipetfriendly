-- 076: busqueda autonoma de temas y fuentes para el generador editorial del blog.
-- Aditiva: no modifica claim_blog_generation, finish_blog_generation, save_blog_generation_stage, save_blog_editorial_revision, el intervalo
-- de 36 horas ni los triggers de publicacion existentes. Todas las tablas nuevas tienen RLS sin politicas y solo las usa service_role.
-- Agrega dos triggers en blog_posts que SOLO actuan sobre posts generados (generation_run_id no nulo):
--   BEFORE INSERT: no se crea un borrador generado sin una revision semantica veterinaria aprobada para su titulo, texto y meta descripcion.
--   BEFORE UPDATE: cualquier cambio de titulo, texto o meta descripcion invalida la aprobacion anterior y no se puede publicar un generado
--                  sin una aprobacion vigente para el texto exacto (los posts generados antes de esta migracion se respetan tal como estan).
begin;

create table public.blog_topic_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  url text not null check (url ~ '^https://'),
  url_hash text not null unique,
  title text not null check (length(title) between 1 and 300),
  species text not null check (species in ('dog','cat','rabbit','other')),
  category text,
  status text not null default 'discovered' check (status in ('discovered','selected','used','rejected')),
  permanent boolean not null default false,
  reason_code text,
  http_status integer,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  last_run_id uuid references public.blog_generation_runs(id),
  origin text not null default 'discovery' check (origin in ('seed','discovery','legacy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index blog_topic_candidates_pool_idx on public.blog_topic_candidates(species, status) where not permanent;
create index blog_topic_candidates_run_idx on public.blog_topic_candidates(last_run_id);

create table public.blog_generation_candidate_attempts (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.blog_generation_runs(id),
  candidate_id uuid references public.blog_topic_candidates(id),
  source_id text not null,
  url text not null,
  title text,
  species text,
  category text,
  outcome text not null check (outcome in ('selected','source_failed','policy_rejected','content_rejected','semantic_unavailable')),
  reason_code text,
  http_status integer,
  detail text,
  verification_counted boolean not null default false,
  cooldown_hours integer,
  created_at timestamptz not null default now()
);
create index blog_generation_candidate_attempts_run_idx on public.blog_generation_candidate_attempts(run_id, id);

create table public.blog_source_discovery (
  source_key text primary key,
  last_claimed_at timestamptz not null default now(),
  last_status text,
  last_count integer
);

alter table public.blog_topic_candidates enable row level security;
alter table public.blog_generation_candidate_attempts enable row level security;
alter table public.blog_source_discovery enable row level security;
revoke all on table public.blog_topic_candidates, public.blog_generation_candidate_attempts, public.blog_source_discovery from anon, authenticated;

alter table public.blog_generation_runs
  add column species text,
  add column topic_id text,
  add column selection jsonb not null default '{}'::jsonb,
  add column budget jsonb not null default '{}'::jsonb;

create function public.blog_candidate_url_hash(p_url text)
returns text language sql immutable set search_path = public as $$
  select md5(lower(regexp_replace(regexp_replace(coalesce(p_url, ''), '[?#].*$', ''), '/+$', '')))
$$;

-- Fuentes ya usadas por articulos generados: no se vuelven a proponer. La ruta anterior de Cats Protection redirige a la nueva.
insert into public.blog_topic_candidates(source_id, url, url_hash, title, species, status, permanent, reason_code, origin)
select distinct on (h.url_hash) 'legacy', h.url, h.url_hash, left(h.title, 300), 'other', 'used', true, 'draft_created', 'legacy'
from (
  select replace(src->>'url', '/help-and-advice/home-and-environment/', '/help-and-advice/caring-for-your-cat/home-and-environment/') as url,
    public.blog_candidate_url_hash(replace(src->>'url', '/help-and-advice/home-and-environment/', '/help-and-advice/caring-for-your-cat/home-and-environment/')) as url_hash,
    p.title
  from public.blog_posts p
  cross join lateral jsonb_array_elements(coalesce(p.editorial_metadata->'sources', '[]'::jsonb)) src
  where p.generation_run_id is not null and coalesce(src->>'url', '') like 'https://%'
) h
on conflict (url_hash) do nothing;

-- Contenido historico: los posts generados que YA existen se respetan exactamente como estan. Se registra la huella de su titulo, texto y meta
-- descripcion actuales; mientras coincidan con esa huella se pueden (re)publicar sin una nueva aprobacion semantica. Cualquier cambio exige una
-- aprobacion vigente. No se modifica ninguna fila de blog_posts.
create table public.blog_vet_review_grandfathered (
  post_id uuid primary key references public.blog_posts(id) on delete cascade,
  content_md5 text not null,
  title_md5 text not null,
  meta_md5 text not null,
  recorded_at timestamptz not null default now()
);
alter table public.blog_vet_review_grandfathered enable row level security;
revoke all on table public.blog_vet_review_grandfathered from anon, authenticated;
insert into public.blog_vet_review_grandfathered(post_id, content_md5, title_md5, meta_md5)
select p.id, md5(coalesce(p.content, '')), md5(coalesce(p.title, '')), md5(coalesce(p.meta_description, ''))
from public.blog_posts p where p.generation_run_id is not null
on conflict (post_id) do nothing;

create function public.upsert_blog_topic_candidates(p_candidates jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_item jsonb; v_inserted integer := 0; v_total integer;
begin
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates) > 50 then raise exception 'Lote de candidatos invalido'; end if;
  select count(*) into v_total from public.blog_topic_candidates;
  for v_item in select * from jsonb_array_elements(p_candidates) loop
    exit when v_total + v_inserted >= 300;
    if coalesce(v_item->>'url', '') !~ '^https://' or coalesce(v_item->>'source_id', '') = ''
      or coalesce(v_item->>'species', '') not in ('dog','cat','rabbit','other') then continue; end if;
    insert into public.blog_topic_candidates(source_id, url, url_hash, title, species, origin)
    values (left(v_item->>'source_id', 60), v_item->>'url', public.blog_candidate_url_hash(v_item->>'url'),
      left(coalesce(nullif(v_item->>'title', ''), v_item->>'url'), 300), v_item->>'species',
      case when v_item->>'origin' = 'seed' then 'seed' else 'discovery' end)
    on conflict (url_hash) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end loop;
  return v_inserted;
end;
$$;

create function public.list_blog_topic_candidates(p_species text[], p_limit integer default 40)
returns table (id uuid, source_id text, url text, title text, species text, attempts integer, last_attempt_at timestamptz)
language sql security definer stable set search_path = public as $$
  select c.id, c.source_id, c.url, c.title, c.species, c.attempts, c.last_attempt_at
  from public.blog_topic_candidates c
  where not c.permanent and c.status in ('discovered', 'rejected')
    and (c.next_retry_at is null or c.next_retry_at <= now())
    and (p_species is null or c.species = any(p_species))
  order by c.last_attempt_at asc nulls first, c.created_at asc
  limit least(greatest(coalesce(p_limit, 40), 1), 50)
$$;

-- Registra intentos sin liberar la reserva. Valida el token vigente y aplica topes duros por corrida.
create function public.record_blog_generation_attempts(p_id uuid, p_token uuid, p_attempts jsonb, p_meta jsonb default '{}'::jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_run public.blog_generation_runs%rowtype;
  v_item jsonb; v_outcome text; v_candidate uuid; v_cooldown integer;
begin
  perform 1 from public.blog_generation_state where singleton for update;
  select * into v_run from public.blog_generation_runs where id = p_id for update;
  if not found or p_token is null or v_run.lease_token is distinct from p_token or v_run.lease_until is null or v_run.lease_until < now()
    or not exists (select 1 from public.blog_generation_state where singleton and active_run_id = p_id)
    then raise exception 'Reserva de generacion vencida'; end if;
  if jsonb_typeof(p_attempts) is distinct from 'array' or jsonb_array_length(p_attempts) > 10 then raise exception 'Lote de intentos invalido'; end if;
  for v_item in select * from jsonb_array_elements(p_attempts) loop
    v_outcome := v_item->>'outcome';
    if v_outcome not in ('selected','source_failed','policy_rejected','content_rejected','semantic_unavailable') then raise exception 'Resultado de intento invalido'; end if;
    v_candidate := nullif(v_item->>'candidate_id', '')::uuid;
    v_cooldown := nullif(v_item->>'cooldown_hours', '')::integer;
    insert into public.blog_generation_candidate_attempts(run_id, candidate_id, source_id, url, title, species, category, outcome, reason_code, http_status, detail, verification_counted, cooldown_hours)
    values (p_id, v_candidate, left(coalesce(v_item->>'source_id', ''), 60), left(coalesce(v_item->>'url', ''), 1000), left(v_item->>'title', 300),
      left(v_item->>'species', 20), left(v_item->>'category', 60), v_outcome, left(v_item->>'reason_code', 60),
      nullif(v_item->>'http_status', '')::integer, left(v_item->>'detail', 300), coalesce((v_item->>'verification_counted')::boolean, false), v_cooldown);
    if v_candidate is not null then
      update public.blog_topic_candidates set
        attempts = attempts + 1, last_attempt_at = now(), last_run_id = p_id,
        category = coalesce(nullif(v_item->>'category', ''), category),
        reason_code = nullif(v_item->>'reason_code', ''), http_status = nullif(v_item->>'http_status', '')::integer,
        status = case when v_outcome = 'selected' then 'selected' when v_outcome = 'semantic_unavailable' then 'discovered' else 'rejected' end,
        permanent = (v_outcome not in ('selected', 'semantic_unavailable') and v_cooldown is null),
        next_retry_at = case when v_outcome = 'selected' or v_cooldown is null then null else now() + make_interval(hours => least(v_cooldown, 2160)) end,
        updated_at = now()
      where id = v_candidate and status <> 'used';
    end if;
  end loop;
  if (select count(*) from public.blog_generation_candidate_attempts where run_id = p_id and verification_counted) > 12
    then raise exception 'Limite de verificaciones por corrida excedido'; end if;
  if (select count(*) from public.blog_generation_candidate_attempts where run_id = p_id and outcome = 'content_rejected') > 2
    then raise exception 'Limite de redacciones por corrida excedido'; end if;
  if (select count(*) from public.blog_generation_candidate_attempts where run_id = p_id) > 60
    then raise exception 'Limite de intentos por corrida excedido'; end if;
  update public.blog_generation_runs set
    species = coalesce(nullif(p_meta->>'species', ''), species),
    topic_id = coalesce(nullif(p_meta->>'topic_id', ''), topic_id),
    selection = case when jsonb_typeof(p_meta->'selection') = 'object' then p_meta->'selection' else selection end
  where id = p_id;
  return jsonb_array_length(p_attempts);
end;
$$;

-- Reserva un presupuesto por corrida ANTES de gastarlo. Los maximos son de la base (la aplicacion solo puede pedir menos) y el
-- contador vive en la fila de la corrida: sobrevive a reinicios, errores, reintentos y reanudaciones. Si no hay cupo devuelve
-- allowed=false sin modificar nada; con reserva vencida o token ajeno lanza error, como el resto de las funciones con lease.
create function public.reserve_blog_generation_budget(p_id uuid, p_token uuid, p_kind text, p_cap integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_run public.blog_generation_runs%rowtype;
  v_hard integer; v_cap integer; v_used integer; v_budget jsonb;
begin
  perform 1 from public.blog_generation_state where singleton for update;
  select * into v_run from public.blog_generation_runs where id = p_id for update;
  if not found or p_token is null or v_run.lease_token is distinct from p_token or v_run.lease_until is null or v_run.lease_until < now()
    or not exists (select 1 from public.blog_generation_state where singleton and active_run_id = p_id)
    then raise exception 'Reserva de generacion vencida'; end if;
  v_hard := case p_kind when 'pulse' then 8 when 'verification' then 12 when 'candidate_semantic' then 6
    when 'article_semantic' then 2 when 'draft' then 2 end;
  if v_hard is null then raise exception 'Tipo de presupuesto invalido'; end if;
  v_cap := least(v_hard, greatest(coalesce(p_cap, v_hard), 0));
  v_used := coalesce((v_run.budget->>p_kind)::integer, 0);
  if v_used >= v_cap then
    return jsonb_build_object('allowed', false, 'kind', p_kind, 'used', v_used, 'cap', v_cap, 'budget', v_run.budget);
  end if;
  update public.blog_generation_runs set budget = jsonb_set(budget, array[p_kind], to_jsonb(v_used + 1), true)
    where id = p_id returning budget into v_budget;
  return jsonb_build_object('allowed', true, 'kind', p_kind, 'used', v_used + 1, 'cap', v_cap, 'budget', v_budget);
end;
$$;

-- Cierra una corrida sin candidatos aptos. Solo puede ALARGAR la espera (maximo 6 horas); nunca acorta las reglas existentes.
create function public.retain_blog_generation_search_exhausted(p_id uuid, p_token uuid, p_payload jsonb, p_error text, p_not_before timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.save_blog_generation_stage(p_id, p_token, 'retained', p_payload, p_error);
  update public.blog_generation_state
    set next_eligible_at = greatest(next_eligible_at, least(coalesce(p_not_before, now()), now() + interval '6 hours'))
    where singleton;
  return true;
end;
$$;

create function public.claim_blog_source_discovery(p_source_key text, p_min_days integer default 7)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.blog_source_discovery(source_key, last_claimed_at) values (left(p_source_key, 120), now())
  on conflict (source_key) do update set last_claimed_at = now()
    where public.blog_source_discovery.last_claimed_at <= now() - make_interval(days => greatest(coalesce(p_min_days, 7), 1));
  return found;
end;
$$;

create function public.record_blog_source_discovery(p_source_key text, p_status text, p_count integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.blog_source_discovery set last_status = left(p_status, 40), last_count = greatest(coalesce(p_count, 0), 0),
    last_claimed_at = case when p_status = 'ok' then last_claimed_at else now() - interval '6 days' end
  where source_key = left(p_source_key, 120);
end;
$$;

-- Resultado de la corrida sobre su candidato, sin depender de quien cambie la etapa (incluida una reserva vencida).
create function public.sync_blog_candidate_run_outcome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 'complete' and old.stage is distinct from 'complete' then
    update public.blog_topic_candidates set status = 'used', permanent = true, reason_code = 'draft_created', updated_at = now()
      where last_run_id = new.id and status = 'selected';
  elsif new.stage = 'retained' and old.stage is distinct from 'retained' then
    update public.blog_topic_candidates set status = 'rejected', permanent = false, reason_code = 'run_retained', next_retry_at = now() + interval '30 days', updated_at = now()
      where last_run_id = new.id and status = 'selected';
  end if;
  return null;
end;
$$;
create trigger blog_candidate_run_outcome after update of stage on public.blog_generation_runs
  for each row execute function public.sync_blog_candidate_run_outcome();

-- Ultima barrera, independiente del codigo de la aplicacion: un borrador GENERADO (generation_run_id no nulo) solo se puede crear
-- si la corrida guarda una revision semantica veterinaria aprobada, con confianza suficiente, para el titulo, el texto y la meta descripcion exactos.
-- Solo actua en INSERT de posts generados; no afecta a los posts existentes ni a los creados manualmente.
create function public.guard_blog_generated_post_vet_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_payload jsonb;
begin
  if new.generation_run_id is null then return new; end if;
  select payload into v_payload from public.blog_generation_runs where id = new.generation_run_id;
  if v_payload is null
    or (v_payload #> '{vet_review,approved}') is distinct from 'true'::jsonb
    or jsonb_typeof(v_payload #> '{vet_review,confidence}') is distinct from 'number'
    or (v_payload #>> '{vet_review,confidence}')::numeric < 0.8
    or v_payload #>> '{vet_review,content_md5}' is distinct from md5(coalesce(v_payload->>'content', ''))
    or v_payload #>> '{vet_review,title_md5}' is distinct from md5(coalesce(v_payload->>'title', ''))
    or v_payload #>> '{vet_review,meta_md5}' is distinct from md5(coalesce(v_payload->>'meta_description', ''))
    or new.content is distinct from v_payload->>'content'
    or new.title is distinct from v_payload->>'title'
    or new.meta_description is distinct from v_payload->>'meta_description'
  then raise exception 'Borrador bloqueado: falta una revision semantica veterinaria aprobada para este texto'; end if;
  return new;
end;
$$;
create trigger blog_generated_post_vet_review_guard before insert on public.blog_posts
  for each row execute function public.guard_blog_generated_post_vet_review();

-- Edicion y publicacion de posts generados. No reemplaza guard_generated_blog_publication (063): convive con ella.
--  * Un post generado no se puede desvincular de su corrida (eso evitaba todas las guardas).
--  * Cambiar titulo, texto o meta descripcion invalida la aprobacion previa (queda registrada con approved=false, no se borra), salvo que la
--    misma operacion aporte una aprobacion nueva (revalidacion): esa se comprueba contra el texto en el momento de publicar.
--  * Publicar (o seguir publicado cambiando el texto) exige una aprobacion vigente para el titulo, texto y meta descripcion exactos, o que el
--    texto coincida con la huella historica registrada al aplicar esta migracion.
--  * Editar un borrador, o un publicado sin tocar el texto, no se restringe. Los posts manuales (sin generation_run_id) no se ven afectados.
create function public.guard_blog_generated_post_vet_review_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_text_changed boolean; v_valid boolean;
begin
  if old.generation_run_id is not null and new.generation_run_id is distinct from old.generation_run_id then
    raise exception 'Un borrador generado no se puede desvincular de su corrida';
  end if;
  if new.generation_run_id is null then return new; end if;
  v_old := old.editorial_metadata->'vet_review';
  v_new := new.editorial_metadata->'vet_review';
  v_text_changed := new.content is distinct from old.content or new.title is distinct from old.title
    or new.meta_description is distinct from old.meta_description;
  if v_text_changed and v_new is not null and v_new is not distinct from v_old and (v_new->'approved') is distinct from 'false'::jsonb then
    new.editorial_metadata := jsonb_set(new.editorial_metadata, '{vet_review}', v_new || jsonb_build_object('approved', false, 'invalidated', true,
      'invalidated_reason', 'texto_modificado', 'invalidated_at', now()));
    v_new := new.editorial_metadata->'vet_review';
  end if;
  if new.status is distinct from 'published' then return new; end if;
  if old.status = 'published' and not v_text_changed then return new; end if;
  v_valid := coalesce((v_new->'approved') = 'true'::jsonb, false)
    and jsonb_typeof(v_new->'confidence') = 'number' and (v_new->>'confidence')::numeric >= 0.8
    and v_new->>'content_md5' = md5(coalesce(new.content, ''))
    and v_new->>'title_md5' = md5(coalesce(new.title, ''))
    and v_new->>'meta_md5' = md5(coalesce(new.meta_description, ''));
  if coalesce(v_valid, false) then return new; end if;
  if exists (select 1 from public.blog_vet_review_grandfathered g where g.post_id = new.id
    and g.content_md5 = md5(coalesce(new.content, '')) and g.title_md5 = md5(coalesce(new.title, ''))
    and g.meta_md5 = md5(coalesce(new.meta_description, ''))) then return new; end if;
  raise exception 'Revision semantica veterinaria pendiente: el texto publicado debe coincidir con una aprobacion vigente';
end;
$$;
create trigger blog_generated_post_vet_review_publish_guard before update on public.blog_posts
  for each row execute function public.guard_blog_generated_post_vet_review_update();

create function public.admin_blog_generation_run_detail(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then raise exception 'No autorizado'; end if;
  return jsonb_build_object(
    'run', (select jsonb_build_object('id', r.id, 'stage', r.stage, 'created_at', r.created_at, 'completed_at', r.completed_at, 'error', r.error,
      'species', r.species, 'topic_id', r.topic_id, 'selection', r.selection) from public.blog_generation_runs r where r.id = p_run_id),
    'post_id', (select p.id from public.blog_posts p where p.generation_run_id = p_run_id),
    'attempts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'at', a.created_at, 'source_id', a.source_id, 'url', a.url, 'title', a.title,
      'species', a.species, 'category', a.category, 'outcome', a.outcome, 'reason_code', a.reason_code, 'http_status', a.http_status, 'detail', a.detail,
      'verification_counted', a.verification_counted) order by a.id) from public.blog_generation_candidate_attempts a where a.run_id = p_run_id), '[]'::jsonb));
end;
$$;

create function public.admin_blog_candidate_pool_summary()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then raise exception 'No autorizado'; end if;
  return coalesce((select jsonb_agg(row_data) from (
    select jsonb_build_object('source_id', c.source_id, 'species', c.species, 'total', count(*),
      'eligible', count(*) filter (where not c.permanent and c.status in ('discovered', 'rejected') and (c.next_retry_at is null or c.next_retry_at <= now())),
      'used', count(*) filter (where c.status = 'used'),
      'discarded', count(*) filter (where c.permanent and c.status <> 'used')) as row_data
    from public.blog_topic_candidates c group by c.source_id, c.species order by c.source_id, c.species) s), '[]'::jsonb);
end;
$$;

revoke all on function public.blog_candidate_url_hash(text), public.upsert_blog_topic_candidates(jsonb), public.list_blog_topic_candidates(text[], integer),
  public.record_blog_generation_attempts(uuid, uuid, jsonb, jsonb), public.reserve_blog_generation_budget(uuid, uuid, text, integer),
  public.retain_blog_generation_search_exhausted(uuid, uuid, jsonb, text, timestamptz),
  public.claim_blog_source_discovery(text, integer), public.record_blog_source_discovery(text, text, integer), public.sync_blog_candidate_run_outcome(),
  public.guard_blog_generated_post_vet_review(), public.guard_blog_generated_post_vet_review_update()
  from public, anon, authenticated;
grant execute on function public.upsert_blog_topic_candidates(jsonb), public.list_blog_topic_candidates(text[], integer),
  public.record_blog_generation_attempts(uuid, uuid, jsonb, jsonb), public.reserve_blog_generation_budget(uuid, uuid, text, integer),
  public.retain_blog_generation_search_exhausted(uuid, uuid, jsonb, text, timestamptz),
  public.claim_blog_source_discovery(text, integer), public.record_blog_source_discovery(text, text, integer) to service_role;
revoke all on function public.admin_blog_generation_run_detail(uuid), public.admin_blog_candidate_pool_summary() from public, anon;
grant execute on function public.admin_blog_generation_run_detail(uuid), public.admin_blog_candidate_pool_summary() to authenticated;

commit;

-- Rollback (solo si hiciera falta; los datos de trazabilidad se perderian). Primero revertir el deploy del backend.
-- begin;
-- drop trigger if exists blog_generated_post_vet_review_publish_guard on public.blog_posts;
-- drop trigger if exists blog_generated_post_vet_review_guard on public.blog_posts;
-- drop trigger if exists blog_candidate_run_outcome on public.blog_generation_runs;
-- drop function if exists public.guard_blog_generated_post_vet_review_update(), public.guard_blog_generated_post_vet_review(), public.sync_blog_candidate_run_outcome(), public.admin_blog_generation_run_detail(uuid), public.admin_blog_candidate_pool_summary(),
--   public.record_blog_source_discovery(text, text, integer), public.claim_blog_source_discovery(text, integer),
--   public.retain_blog_generation_search_exhausted(uuid, uuid, jsonb, text, timestamptz), public.reserve_blog_generation_budget(uuid, uuid, text, integer),
--   public.record_blog_generation_attempts(uuid, uuid, jsonb, jsonb),
--   public.list_blog_topic_candidates(text[], integer), public.upsert_blog_topic_candidates(jsonb), public.blog_candidate_url_hash(text);
-- drop table if exists public.blog_vet_review_grandfathered, public.blog_generation_candidate_attempts, public.blog_source_discovery, public.blog_topic_candidates;
-- alter table public.blog_generation_runs drop column if exists species, drop column if exists topic_id, drop column if exists selection, drop column if exists budget;
-- commit;
