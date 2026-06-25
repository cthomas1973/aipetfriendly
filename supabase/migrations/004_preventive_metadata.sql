-- Agrega columna metadata para guardar detalle de medicacion/vacuna y recordatorios.

alter table public.preventive_tasks
  add column if not exists metadata jsonb;
