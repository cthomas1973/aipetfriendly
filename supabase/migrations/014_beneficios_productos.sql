-- Tabla para gestionar productos de ML desde el panel admin.
-- El admin pega URLs de articulo.mercadolibre.com.ar, el sistema extrae el MLA ID
-- y construye el permalink. El link final = permalink + ?matt_tool=ID

create table if not exists public.beneficios_productos (
  id            uuid primary key default gen_random_uuid(),
  url_ml        text not null,                      -- URL original pegada por el admin
  mla_id        text not null,                      -- Ej: MLA-1234567890
  permalink     text not null,                      -- https://articulo.mercadolibre.com.ar/MLA-xxx
  title         text not null,
  thumbnail     text,
  price         numeric(12,2),                      -- Precio manual (opcional, puede ser null)
  grupo         text not null default 'alimentos'
                check (grupo in ('alimentos','accesorios','higiene','descanso')),
  pet_types     text[] not null default array['perro','gato'],
  free_shipping boolean not null default false,
  fast_delivery boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Indice para queries por grupo y tipo de mascota
create index if not exists beneficios_productos_grupo_idx on public.beneficios_productos (grupo)
  where active = true;

alter table public.beneficios_productos enable row level security;

-- Todos pueden leer productos activos
drop policy if exists "Public read beneficios productos" on public.beneficios_productos;
create policy "Public read beneficios productos"
  on public.beneficios_productos for select
  using (active = true);

-- Solo usuarios autenticados con acceso premium pueden escribir (admin)
drop policy if exists "Admin write beneficios productos" on public.beneficios_productos;
create policy "Admin write beneficios productos"
  on public.beneficios_productos for all
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.users
      where id = auth.uid()
      and access_mode = 'premium'
    )
  );
