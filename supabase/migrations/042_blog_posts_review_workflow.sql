-- Blog "Tips del día": flujo de revision editorial antes de publicar.
-- El cron (api/cron/generate-blog-post.js) ahora inserta cada post como
-- 'draft'; un admin humano lo revisa/edita y lo publica desde el panel
-- Admin > Blog (AdminBlogSection.tsx). Objetivo: que el contenido generado
-- por IA tenga supervision editorial real antes de salir publico (requisito
-- de Google AdSense/Search sobre contenido de bajo valor / escalado).

alter table public.blog_posts
  add column if not exists status text not null default 'draft' check (status in ('draft', 'published'));

create index if not exists idx_blog_posts_status_created_at on public.blog_posts (status, created_at desc);

-- Los posts ya existentes (generados/publicados antes de este cambio) quedan
-- publicados tal cual estaban, para no ocultar contenido que ya estaba
-- online e indexado por Google.
update public.blog_posts set status = 'published' where status = 'draft';

-- Lectura publica: a partir de ahora solo posts ya aprobados/publicados.
create or replace function public.list_blog_posts(p_limit integer default 20, p_offset integer default 0)
returns setof public.blog_posts
language sql
security definer
set search_path = public
stable
as $$
  select * from public.blog_posts
  where status = 'published'
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.get_blog_post_by_slug(p_slug text)
returns public.blog_posts
language sql
security definer
set search_path = public
stable
as $$
  select * from public.blog_posts where slug = p_slug and status = 'published' limit 1;
$$;

-- Admin: lista TODOS los posts (draft y published), mas recientes primero.
create or replace function public.admin_list_blog_posts()
returns setof public.blog_posts
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  return query select * from public.blog_posts order by created_at desc;
end;
$$;

grant execute on function public.admin_list_blog_posts() to authenticated;

-- Admin: edita titulo/contenido y cambia el estado (publicar / volver a borrador).
create or replace function public.admin_update_blog_post(
  p_id uuid,
  p_title text,
  p_content text,
  p_status text
)
returns public.blog_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.blog_posts%rowtype;
begin
  if not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  if p_status not in ('draft', 'published') then
    raise exception 'Estado invalido: %', p_status;
  end if;

  update public.blog_posts
  set title = coalesce(nullif(btrim(p_title), ''), title),
      content = coalesce(nullif(btrim(p_content), ''), content),
      status = p_status
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Post no encontrado';
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_update_blog_post(uuid, text, text, text) to authenticated;

-- Admin: descarta un borrador que no vale la pena publicar.
create or replace function public.admin_delete_blog_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  delete from public.blog_posts where id = p_id;
end;
$$;

grant execute on function public.admin_delete_blog_post(uuid) to authenticated;
