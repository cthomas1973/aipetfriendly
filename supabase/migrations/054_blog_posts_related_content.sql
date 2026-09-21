-- Extiende el enlazado interno del blog (ver migracion 053, que ya permite
-- blog->guia) para soportar tambien blog->blog y blog->producto (tienda ML).
-- Con esto el "enlazado relacionado" queda simetrico con src/data/petGuides.ts
-- (que ya define relatedGuideSlug/relatedBlogSlug/relatedProductId a nivel de
-- tipos, ver PetGuide), y se puede curar manualmente desde Admin > Blog en
-- vez de depender solo del pickRelatedGuide aleatorio del cron.

alter table public.blog_posts
  add column if not exists related_blog_slug text references public.blog_posts(slug) on delete set null,
  add column if not exists related_product_id uuid references public.beneficios_productos(id) on delete set null;

-- Admin: edita titulo/contenido/estado y ahora tambien los 3 links
-- relacionados (guia/blog/producto). Se dropea la firma vieja (4 parametros)
-- antes de crear la nueva de 7: si solo se hiciera "create or replace" con
-- parametros extra, Postgres crea una funcion sobrecargada en vez de
-- reemplazarla, y Supabase RPC con argumentos nombrados queda ambiguo entre
-- ambas firmas.
drop function if exists public.admin_update_blog_post(uuid, text, text, text);

create or replace function public.admin_update_blog_post(
  p_id uuid,
  p_title text,
  p_content text,
  p_status text,
  p_related_guide_slug text default null,
  p_related_blog_slug text default null,
  p_related_product_id uuid default null
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

  if p_related_blog_slug is not null and p_related_blog_slug = (select slug from public.blog_posts where id = p_id) then
    raise exception 'Un post no puede enlazarse a si mismo';
  end if;

  update public.blog_posts
  set title = coalesce(nullif(btrim(p_title), ''), title),
      content = coalesce(nullif(btrim(p_content), ''), content),
      status = p_status,
      related_guide_slug = nullif(btrim(coalesce(p_related_guide_slug, '')), ''),
      related_blog_slug = nullif(btrim(coalesce(p_related_blog_slug, '')), ''),
      related_product_id = p_related_product_id
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Post no encontrado';
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_update_blog_post(uuid, text, text, text, text, text, uuid) to authenticated;
