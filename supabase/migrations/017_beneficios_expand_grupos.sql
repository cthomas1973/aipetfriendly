-- Amplia las categorias permitidas para beneficios_productos.
-- Nuevos grupos: salud y tecnologia.

alter table public.beneficios_productos
  drop constraint if exists beneficios_productos_grupo_check;

alter table public.beneficios_productos
  add constraint beneficios_productos_grupo_check
  check (grupo in ('alimentos', 'accesorios', 'higiene', 'descanso', 'salud', 'tecnologia'));
