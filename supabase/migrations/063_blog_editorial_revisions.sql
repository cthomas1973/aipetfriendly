begin;

create table public.blog_editorial_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id),
  previous_snapshot jsonb not null,
  replacement_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.blog_editorial_revisions enable row level security;

create or replace function public.guard_generated_blog_publication()
returns trigger language plpgsql set search_path = public as $$
declare snapshot jsonb; invalidated boolean;
begin
  if new.generation_run_id is not null then
    snapshot := new.editorial_metadata->'validation_snapshot';
    invalidated := new.editorial_metadata->>'content' is distinct from new.content
      or new.editorial_metadata->>'title' is distinct from new.title;
    if new.editorial_metadata->>'editorial_version' = 'editorial-v2' then
      invalidated := invalidated or snapshot is null
        or snapshot->>'content' is distinct from new.content
        or snapshot->>'title' is distinct from new.title
        or snapshot->>'cover_url' is distinct from new.image_url
        or snapshot->>'source_name' is distinct from new.source_name
        or snapshot->'sources' is distinct from new.editorial_metadata->'sources'
        or snapshot->'visual_plan' is distinct from new.editorial_metadata->'visual_plan'
        or snapshot->>'infographic_url' is distinct from new.editorial_metadata->>'infographic_url';
    end if;
    if invalidated then
      new.editorial_metadata := jsonb_set(coalesce(new.editorial_metadata, '{}'::jsonb), '{quality}',
        coalesce(new.editorial_metadata->'quality', '{}'::jsonb) || jsonb_build_object('ready', false,
          'failed', jsonb_build_array('editorial_revision_requires_revalidation'), 'humanEditorialReviewRequired', true));
      new.editorial_metadata := jsonb_set(new.editorial_metadata, '{infographic_validation}',
        coalesce(new.editorial_metadata->'infographic_validation', '{}'::jsonb) || '{"valid":false}'::jsonb);
    end if;
    if new.status = 'published' and (invalidated
      or new.editorial_metadata #>> '{quality,ready}' is distinct from 'true'
      or new.editorial_metadata #>> '{quality,veterinaryReviewRequired}' = 'true'
      or coalesce(new.image_url, '') = '' or coalesce(new.editorial_metadata->>'infographic_url', '') = ''
      or (new.editorial_metadata->>'editorial_version' = 'editorial-v2'
        and new.editorial_metadata #>> '{infographic_validation,valid}' is distinct from 'true')) then
      raise exception 'Revision editorial o veterinaria pendiente: no se publica el articulo';
    end if;
  end if;
  return new;
end;
$$;

create function public.save_blog_editorial_revision(p_id uuid, p_expected_hash text, p_article jsonb)
returns public.blog_posts language plpgsql security definer set search_path = public as $$
declare previous public.blog_posts%rowtype; replacement public.blog_posts%rowtype; metadata jsonb;
begin
  select * into previous from public.blog_posts where id = p_id for update;
  if not found or previous.status <> 'draft' then raise exception 'Solo se revisan borradores existentes'; end if;
  if previous.editorial_metadata->>'revision_key' = p_article->>'revision_key'
    and previous.content = p_article->>'content' and previous.title = p_article->>'title'
    and previous.image_url = p_article->>'cover_url'
    and previous.editorial_metadata #>> '{quality,ready}' = p_article #>> '{quality,ready}' then return previous; end if;
  if md5(previous.content) is distinct from p_expected_hash then raise exception 'El borrador cambio: revisar antes de reemplazar'; end if;
  if p_article->>'slug' is distinct from previous.slug then raise exception 'La revision debe conservar el slug'; end if;
  if p_article->>'editorial_version' is distinct from 'editorial-v2' or coalesce(p_article->>'content', '') = ''
    or coalesce(p_article->>'cover_url', '') = '' or coalesce(p_article->>'infographic_url', '') = '' then raise exception 'Revision incompleta'; end if;
  metadata := jsonb_set(p_article, '{sources}', (select coalesce(jsonb_agg(source - 'text'), '[]'::jsonb) from jsonb_array_elements(p_article->'sources') source));
  metadata := jsonb_set(metadata, '{validation_snapshot}', jsonb_build_object('content', metadata->>'content', 'title', metadata->>'title',
    'cover_url', metadata->>'cover_url', 'source_name', metadata->>'source_name', 'sources', metadata->'sources',
    'visual_plan', metadata->'visual_plan', 'infographic_url', metadata->>'infographic_url'));
  if previous.editorial_metadata = metadata and previous.content = metadata->>'content' then return previous; end if;
  update public.blog_posts set title = metadata->>'title', content = metadata->>'content', status = 'draft',
    image_url = metadata->>'cover_url', source_name = metadata->>'source_name', meta_description = metadata->>'meta_description',
    estimated_reading_time = greatest(1, ceil(array_length(regexp_split_to_array(metadata->>'content', '\s+'), 1) / 200.0)::integer),
    editorial_metadata = metadata where id = p_id returning * into replacement;
  insert into public.blog_editorial_revisions(post_id, previous_snapshot, replacement_snapshot)
    values (p_id, to_jsonb(previous), to_jsonb(replacement));
  return replacement;
end;
$$;

create function public.admin_list_blog_editorial_revisions(p_post_id uuid)
returns setof public.blog_editorial_revisions language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then raise exception 'No autorizado'; end if;
  return query select * from public.blog_editorial_revisions where post_id = p_post_id order by created_at desc;
end;
$$;
revoke all on function public.save_blog_editorial_revision(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_blog_editorial_revision(uuid,text,jsonb) to service_role;
revoke all on function public.admin_list_blog_editorial_revisions(uuid) from public, anon;
grant execute on function public.admin_list_blog_editorial_revisions(uuid) to authenticated;
commit;