-- Cada post del blog puede enlazar a una guia relacionada de /guias (elegida
-- por el cron, ver api/cron/generate-blog-post.js), para sumar enlaces
-- internos reales entre el blog y las guias en vez de quedar contenido
-- aislado. Es solo el slug (las guias viven en src/data/petGuides.ts, no en
-- una tabla), por eso no hay foreign key.
alter table public.blog_posts
  add column if not exists related_guide_slug text;
