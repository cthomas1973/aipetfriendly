-- 058_blog_posts_meta_description.sql
--
-- PASO 19.3.11: se separa a proposito de la funcion RPC (ver migracion 059)
-- para poder aplicar y verificar cada paso por separado, dado que el proyecto
-- esta en el plan Free de Supabase (sin backups programados ni Point-in-Time
-- Recovery). Esta migracion es la mitad de bajisimo riesgo: solo agrega una
-- columna NULLABLE, sin tocar ninguna fila existente ni ninguna funcion. Los
-- articulos existentes siguen funcionando igual, cayendo al fallback
-- automatico ya implementado (buildBlogDescription via resolveBlogDescription,
-- ver shared/seoMeta.mjs).
alter table public.blog_posts
  add column if not exists meta_description text;
