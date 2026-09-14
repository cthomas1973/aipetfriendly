-- Borradores automaticos de publicaciones en redes sociales generados al crear
-- un post del blog (ver api/cron/generate-blog-post.js), que quedan esperando
-- revision/aprobacion manual del admin en Publicaciones antes de programarse.

alter table public.social_posts
  alter column scheduled_at drop not null;

alter table public.social_posts
  add column if not exists source text,
  add column if not exists source_ref_id uuid references public.blog_posts(id) on delete set null;

-- Evita crear dos veces el borrador si el cron del blog se reintenta para el mismo post.
create unique index if not exists idx_social_posts_source_ref
  on public.social_posts (source, source_ref_id)
  where source is not null and source_ref_id is not null;

alter table public.social_posts drop constraint if exists social_posts_status_check;
alter table public.social_posts
  add constraint social_posts_status_check check (status in ('draft', 'scheduled', 'processing', 'done', 'cancelled'));

drop function if exists public.admin_list_social_posts();

create or replace function public.admin_list_social_posts()
returns table (
  id uuid,
  media_url text,
  media_type text,
  caption text,
  scheduled_at timestamp with time zone,
  status text,
  source text,
  source_ref_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  targets jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    p.id, p.media_url, p.media_type, p.caption, p.scheduled_at, p.status, p.source, p.source_ref_id, p.created_at, p.updated_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
          'platform', t.platform,
          'status', t.status,
          'externalPostId', t.external_post_id,
          'error', t.error,
          'publishedAt', t.published_at
        ) order by t.platform)
       from public.social_post_targets t
       where t.post_id = p.id),
      '[]'::jsonb
    ) as targets
  from public.social_posts p
  order by
    case p.status
      when 'draft' then 0
      when 'processing' then 1
      when 'scheduled' then 2
      when 'done' then 3
      else 4
    end,
    coalesce(p.scheduled_at, p.created_at) desc;
end;
$$;

-- Ahora tambien permite aprobar un borrador ('draft'): al guardar fecha/hora +
-- redes, la publicacion pasa a 'scheduled'.
create or replace function public.admin_update_social_post(
  p_id uuid,
  p_caption text,
  p_scheduled_at timestamp with time zone,
  p_platforms text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_platform text;
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  select status into v_status from public.social_posts where id = p_id;
  if v_status is null then
    raise exception 'Publicacion no encontrada';
  end if;
  if v_status not in ('draft', 'scheduled') then
    raise exception 'Solo se puede editar un borrador o una publicacion pendiente de programar';
  end if;

  if p_scheduled_at is null then
    raise exception 'Falta la fecha/hora de publicacion';
  end if;

  if p_platforms is null or array_length(p_platforms, 1) is null then
    raise exception 'Elegi al menos una red social';
  end if;

  update public.social_posts
  set caption = nullif(btrim(coalesce(p_caption, '')), ''),
      scheduled_at = p_scheduled_at,
      status = 'scheduled',
      updated_at = now()
  where id = p_id;

  delete from public.social_post_targets
  where post_id = p_id and status = 'pending' and platform <> all (p_platforms);

  foreach v_platform in array p_platforms loop
    if v_platform not in ('facebook', 'instagram', 'youtube', 'tiktok') then
      raise exception 'Red social invalida: %', v_platform;
    end if;
    insert into public.social_post_targets (post_id, platform)
    values (p_id, v_platform)
    on conflict (post_id, platform) do nothing;
  end loop;
end;
$$;
