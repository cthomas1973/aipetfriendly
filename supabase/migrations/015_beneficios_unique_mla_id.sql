-- Agregar unique constraint en mla_id para permitir upsert en el cron job,
-- y columna source para distinguir productos manuales de los automaticos.

alter table public.beneficios_productos
  add column if not exists source text not null default 'manual'
  check (source in ('manual', 'auto'));

-- Unique en mla_id para que el upsert del cron no duplique productos
alter table public.beneficios_productos
  drop constraint if exists beneficios_productos_mla_id_key;
alter table public.beneficios_productos
  add constraint beneficios_productos_mla_id_key unique (mla_id);

-- Politica extra: el service role key (usado por el cron/script) puede escribir sin RLS
-- (service role bypasses RLS por defecto en Supabase, no requiere policy adicional)
