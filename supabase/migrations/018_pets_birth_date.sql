-- Persistir fecha de nacimiento real de mascota para mostrarla luego de recargar.

alter table public.pets
  add column if not exists birth_date date;
