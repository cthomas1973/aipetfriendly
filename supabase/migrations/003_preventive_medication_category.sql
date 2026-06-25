-- Habilita la categoria 'medication' en preventivos para esquemas ya creados.
-- Ejecutar en SQL Editor de Supabase o mediante migraciones.

alter table public.preventive_tasks
  drop constraint if exists preventive_tasks_category_check;

alter table public.preventive_tasks
  add constraint preventive_tasks_category_check
  check (category in ('medication', 'vaccine', 'deworming', 'appointment', 'feeding', 'other'));
