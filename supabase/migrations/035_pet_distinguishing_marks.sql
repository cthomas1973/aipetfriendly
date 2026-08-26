-- Señas particulares opcionales de la mascota (usadas en el cartel de identificacion).

alter table public.pets
  add column if not exists distinguishing_marks text;
