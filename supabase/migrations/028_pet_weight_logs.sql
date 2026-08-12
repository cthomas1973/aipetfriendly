-- Historial de peso por mascota, para la seccion "Comida" (grafico de evolucion de peso).

create table if not exists public.pet_weight_logs (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  weight_kg numeric not null check (weight_kg > 0),
  recorded_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_pet_weight_logs_pet_id on public.pet_weight_logs(pet_id);
create index if not exists idx_pet_weight_logs_recorded_at on public.pet_weight_logs(recorded_at);

alter table public.pet_weight_logs enable row level security;

drop policy if exists "Users can view weight logs of their pets" on public.pet_weight_logs;
create policy "Users can view weight logs of their pets" on public.pet_weight_logs
  for select using (
    exists (
      select 1 from public.pets where pets.id = pet_weight_logs.pet_id and pets.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert weight logs for their pets" on public.pet_weight_logs;
create policy "Users can insert weight logs for their pets" on public.pet_weight_logs
  for insert with check (
    exists (
      select 1 from public.pets where pets.id = pet_weight_logs.pet_id and pets.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete weight logs of their pets" on public.pet_weight_logs;
create policy "Users can delete weight logs of their pets" on public.pet_weight_logs
  for delete using (
    exists (
      select 1 from public.pets where pets.id = pet_weight_logs.pet_id and pets.user_id = auth.uid()
    )
  );
