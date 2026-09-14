-- Publicaciones programadas para redes sociales (Instagram, Facebook, TikTok, YouTube).
-- Etapa 0 (panel Admin "Publicaciones"): solo modelo de datos + carga/programacion.
-- La publicacion real hacia cada red (Edge Function + cron) se suma en etapas
-- posteriores; hasta entonces social_post_targets queda en 'pending'.

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  caption text,
  scheduled_at timestamp with time zone not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'done', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_social_posts_scheduled_at on public.social_posts (scheduled_at);

-- Una fila por red social elegida, para poder trackear/reintentar cada una
-- de forma independiente (una red puede fallar sin afectar a las demas).
create table if not exists public.social_post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  platform text not null check (platform in ('facebook', 'instagram', 'youtube', 'tiktok')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'published', 'failed', 'skipped')),
  external_post_id text,
  error text,
  published_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (post_id, platform)
);

alter table public.social_posts enable row level security;
alter table public.social_post_targets enable row level security;

-- Sin policies directas de select/insert/update/delete: todo el acceso pasa por
-- funciones security definer admin_* (gateadas por admin_users), mismo criterio
-- que discount_codes/pet_tag_codes.

create or replace function public.admin_list_social_posts()
returns table (
  id uuid,
  media_url text,
  media_type text,
  caption text,
  scheduled_at timestamp with time zone,
  status text,
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
    p.id, p.media_url, p.media_type, p.caption, p.scheduled_at, p.status, p.created_at, p.updated_at,
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
  order by p.scheduled_at desc;
end;
$$;

create or replace function public.admin_create_social_post(
  p_media_url text,
  p_media_type text,
  p_caption text,
  p_scheduled_at timestamp with time zone,
  p_platforms text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_platform text;
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  if p_media_url is null or btrim(p_media_url) = '' then
    raise exception 'Falta la URL del archivo multimedia';
  end if;

  if p_media_type not in ('image', 'video') then
    raise exception 'Tipo de archivo invalido';
  end if;

  if p_scheduled_at is null then
    raise exception 'Falta la fecha/hora de publicacion';
  end if;

  if p_platforms is null or array_length(p_platforms, 1) is null then
    raise exception 'Elegi al menos una red social';
  end if;

  insert into public.social_posts (media_url, media_type, caption, scheduled_at, created_by)
  values (p_media_url, p_media_type, nullif(btrim(coalesce(p_caption, '')), ''), p_scheduled_at, auth.uid())
  returning id into v_id;

  foreach v_platform in array p_platforms loop
    if v_platform not in ('facebook', 'instagram', 'youtube', 'tiktok') then
      raise exception 'Red social invalida: %', v_platform;
    end if;
    insert into public.social_post_targets (post_id, platform)
    values (v_id, v_platform)
    on conflict (post_id, platform) do nothing;
  end loop;

  return v_id;
end;
$$;

-- Solo se puede editar mientras la publicacion siga 'scheduled' (nada procesado todavia).
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
  if v_status <> 'scheduled' then
    raise exception 'Solo se puede editar una publicacion pendiente de programar';
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

create or replace function public.admin_cancel_social_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  update public.social_posts
  set status = 'cancelled', updated_at = now()
  where id = p_id and status = 'scheduled';

  update public.social_post_targets
  set status = 'skipped', updated_at = now()
  where post_id = p_id and status = 'pending';
end;
$$;

create or replace function public.admin_delete_social_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  delete from public.social_posts where id = p_id;
end;
$$;
