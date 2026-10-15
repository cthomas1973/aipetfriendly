-- 059_blog_posts_meta_description_rpc_rollback.sql
--
-- NO ES UNA MIGRACION. Vive fuera de supabase/migrations/ a proposito para
-- que `supabase db push` / `supabase migration list` NUNCA lo detecten ni lo
-- apliquen automaticamente. Es un script de reversion MANUAL (copiar/pegar en
-- el SQL Editor de Supabase, o correr con psql), pensado SOLO para el caso en
-- que la migracion 059 cause un problema real en produccion y haga falta
-- volver atras — el proyecto esta en el plan Free de Supabase (sin backups
-- programados ni Point-in-Time Recovery), asi que esta es la unica via de
-- reversion disponible.
--
-- Que hace: restaura admin_update_blog_post a la firma de 7 parametros de la
-- migracion 054 (title/content/status/related_guide_slug/related_blog_slug/
-- related_product_id), igual que estaba ANTES de la migracion 059. NO borra
-- la columna meta_description (migracion 058) ni ningun dato ya guardado en
-- ella — ver nota al final si ademas se quiere revertir esa columna.
--
-- Misma guarda + transaccion explicita que 059 (ver comentarios ahi): si
-- algo falla a mitad de camino, se revierte todo el bloque en vez de dejar
-- la base sin la funcion admin_update_blog_post.
begin;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_update_blog_post'
      and pg_get_function_identity_arguments(p.oid) = 'p_id uuid, p_title text, p_content text, p_status text, p_related_guide_slug text, p_related_blog_slug text, p_related_product_id uuid, p_meta_description text, p_update_meta_description boolean'
  ) then
    raise exception 'admin_update_blog_post(...9 params...) no existe con la firma esperada: no hay nada que revertir, o el estado actual no es el previsto. Revisar manualmente antes de reintentar.';
  end if;
end;
$$;

drop function public.admin_update_blog_post(uuid, text, text, text, text, text, uuid, text, boolean);

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

commit;

-- OPCIONAL, NO INCLUIDO ARRIBA A PROPOSITO (accion destructiva e
-- IRREVERSIBLE sin backups/PITR): si ademas se quiere eliminar la columna
-- meta_description (se pierde cualquier valor ya cargado a mano o por el
-- cron), correrlo por separado y de forma consciente, en su propia
-- transaccion, solo si se esta seguro de que no hace falta conservar esos
-- datos:
--
-- begin;
-- alter table public.blog_posts drop column if exists meta_description;
-- commit;
