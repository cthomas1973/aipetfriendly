-- Veterinaria favorita por usuario (una sola por usuario; se puede cambiar tocando la huellita con corazon).

create table if not exists public.veterinary_favorites (
  user_id uuid primary key references public.users(id) on delete cascade,
  veterinary_id uuid not null references public.veterinary_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_veterinary_favorites_veterinary_id
  on public.veterinary_favorites(veterinary_id);

alter table public.veterinary_favorites enable row level security;

drop policy if exists "Users can view their own vet favorite" on public.veterinary_favorites;
create policy "Users can view their own vet favorite" on public.veterinary_favorites
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own vet favorite" on public.veterinary_favorites;
create policy "Users can insert their own vet favorite" on public.veterinary_favorites
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own vet favorite" on public.veterinary_favorites;
create policy "Users can update their own vet favorite" on public.veterinary_favorites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own vet favorite" on public.veterinary_favorites;
create policy "Users can delete their own vet favorite" on public.veterinary_favorites
  for delete using (auth.uid() = user_id);
