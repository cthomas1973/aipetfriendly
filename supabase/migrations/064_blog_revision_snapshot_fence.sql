begin;
create or replace function public.save_blog_editorial_revision(p_id uuid, p_expected_hash text, p_article jsonb)
returns public.blog_posts language plpgsql security definer set search_path = public as $$
declare previous public.blog_posts%rowtype; replacement public.blog_posts%rowtype; metadata jsonb; current_hash text;
begin
  select * into previous from public.blog_posts where id = p_id for update;
  if not found or previous.status <> 'draft' then raise exception 'Solo se revisan borradores existentes'; end if;
  if previous.editorial_metadata->>'revision_key' = p_article->>'revision_key'
    and previous.content = p_article->>'content' and previous.title = p_article->>'title'
    and previous.image_url = p_article->>'cover_url'
    and previous.editorial_metadata #>> '{quality,ready}' = p_article #>> '{quality,ready}' then return previous; end if;
  current_hash := md5(concat_ws(chr(31), coalesce(previous.title,''), coalesce(previous.content,''),
    coalesce(previous.image_url,''), coalesce(previous.meta_description,''), coalesce(previous.source_name,''), coalesce(previous.editorial_metadata::text,'')));
  if current_hash is distinct from p_expected_hash then raise exception 'El borrador cambio: revisar antes de reemplazar'; end if;
  if p_article->>'slug' is distinct from previous.slug then raise exception 'La revision debe conservar el slug'; end if;
  if p_article->>'editorial_version' is distinct from 'editorial-v2' or coalesce(p_article->>'content','') = ''
    or coalesce(p_article->>'cover_url','') = '' or coalesce(p_article->>'infographic_url','') = '' then raise exception 'Revision incompleta'; end if;
  metadata := jsonb_set(p_article, '{sources}', (select coalesce(jsonb_agg(source - 'text'),'[]'::jsonb) from jsonb_array_elements(p_article->'sources') source));
  metadata := jsonb_set(metadata, '{validation_snapshot}', jsonb_build_object('content', metadata->>'content', 'title', metadata->>'title',
    'cover_url', metadata->>'cover_url', 'source_name', metadata->>'source_name', 'sources', metadata->'sources',
    'visual_plan', metadata->'visual_plan', 'infographic_url', metadata->>'infographic_url'));
  if previous.editorial_metadata = metadata and previous.content = metadata->>'content' then return previous; end if;
  update public.blog_posts set title = metadata->>'title', content = metadata->>'content', status = 'draft',
    image_url = metadata->>'cover_url', source_name = metadata->>'source_name', meta_description = metadata->>'meta_description',
    estimated_reading_time = greatest(1, ceil(array_length(regexp_split_to_array(metadata->>'content','\s+'),1) / 200.0)::integer),
    editorial_metadata = metadata where id = p_id returning * into replacement;
  insert into public.blog_editorial_revisions(post_id, previous_snapshot, replacement_snapshot) values (p_id,to_jsonb(previous),to_jsonb(replacement));
  return replacement;
end;
$$;

create function public.blog_editorial_revision_token(p_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('post', to_jsonb(post), 'token', md5(concat_ws(chr(31), coalesce(title,''), coalesce(content,''), coalesce(image_url,''),
    coalesce(meta_description,''), coalesce(source_name,''), coalesce(editorial_metadata::text,''))))
  from public.blog_posts post where id = p_id and status = 'draft';
$$;
revoke all on function public.blog_editorial_revision_token(uuid) from public, anon, authenticated;
grant execute on function public.blog_editorial_revision_token(uuid) to service_role;
commit;