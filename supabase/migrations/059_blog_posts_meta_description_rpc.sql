-- 059_blog_posts_meta_description_rpc.sql
--
-- PASO 19.3.11: segunda mitad de la feature meta_description SEO (ver
-- migracion 058 para la columna). Separada en su propio archivo para poder
-- aplicarse/revisarse de forma independiente, y envuelta en una transaccion
-- explicita + guarda previa porque el proyecto esta en el plan Free de
-- Supabase (sin backups programados ni Point-in-Time Recovery): un fallo a
-- mitad de camino acá no se podria restaurar desde un backup.
--
-- Por que la transaccion explicita importa: `supabase db push` ejecuta cada
-- archivo de migracion tal cual, sin envolverlo automaticamente en una unica
-- transaccion (cada sentencia de nivel superior es su propio commit salvo que
-- el archivo diga BEGIN/COMMIT). Sin este BEGIN/COMMIT, si el DROP FUNCTION
-- de abajo tuviera exito pero el CREATE OR REPLACE que sigue fallara por
-- cualquier motivo (typo, etc.), la base quedaria SIN la funcion
-- admin_update_blog_post en absoluto (rompe el panel Admin > Blog por
-- completo) hasta la proxima corrida. Con BEGIN/COMMIT, cualquier fallo en
-- cualquier sentencia de aca abajo revierte TODO el bloque (Postgres soporta
-- DDL transaccional), dejando la base exactamente como estaba antes de
-- correr esta migracion.
--
-- Por que la guarda previa importa: en vez de un simple
-- "drop function if exists" (que no avisa si la firma real en produccion no
-- es la esperada, p.ej. por drift manual), se verifica EXPLICITAMENTE que
-- exista la firma vieja de 7 parametros (migracion 054) antes de tocar nada.
-- Si no existe tal cual se espera, se aborta con una excepcion clara en vez
-- de arriesgarse a dropear/crear algo distinto de lo previsto.
begin;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_update_blog_post'
      and pg_get_function_identity_arguments(p.oid) = 'p_id uuid, p_title text, p_content text, p_status text, p_related_guide_slug text, p_related_blog_slug text, p_related_product_id uuid'
  ) then
    raise exception 'admin_update_blog_post(uuid,text,text,text,text,text,uuid) (migracion 054) no existe con la firma esperada: abortando 059 sin tocar nada. Revisar drift manualmente antes de reintentar.';
  end if;
end;
$$;

-- Firma confirmada por la guarda de arriba: se puede dropear con seguridad
-- (sin "if exists", para que cualquier fallo inesperado sea ruidoso).
drop function public.admin_update_blog_post(uuid, text, text, text, text, text, uuid);

-- Admin: edita titulo/contenido/estado/links relacionados y ahora tambien la
-- meta_description manual. p_update_meta_description distingue "no tocar
-- este campo" (default false: cualquier caller que no lo conozca no corre
-- riesgo de borrar una descripcion existente) de "aplicar p_meta_description
-- tal cual" (true: vacio/espacios se graba como NULL = volver al fallback
-- automatico; texto no vacio se guarda recortado). title/content/related_*
-- mantienen exactamente la misma semantica que en la migracion 054.
create or replace function public.admin_update_blog_post(
  p_id uuid,
  p_title text,
  p_content text,
  p_status text,
  p_related_guide_slug text default null,
  p_related_blog_slug text default null,
  p_related_product_id uuid default null,
  p_meta_description text default null,
  p_update_meta_description boolean default false
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
      related_product_id = p_related_product_id,
      meta_description = case
        when p_update_meta_description then nullif(btrim(coalesce(p_meta_description, '')), '')
        else meta_description
      end
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Post no encontrado';
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_update_blog_post(uuid, text, text, text, text, text, uuid, text, boolean) to authenticated;

commit;
