-- Filtrado fino de productos de alimentacion por etapa de vida y tamaño de mascota.
-- 'todas'/'todos' actua como comodin: el producto aplica sin importar la etapa/tamaño.

alter table public.beneficios_productos
  add column if not exists life_stages text[] not null default array['todas'];

alter table public.beneficios_productos
  add column if not exists size_categories text[] not null default array['todos'];

-- Indices para acelerar el filtro por overlaps (usado en cada carga de la pestaña Beneficios)
create index if not exists beneficios_productos_life_stages_idx
  on public.beneficios_productos using gin (life_stages);

create index if not exists beneficios_productos_size_categories_idx
  on public.beneficios_productos using gin (size_categories);
