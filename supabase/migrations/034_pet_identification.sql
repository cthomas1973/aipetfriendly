-- Identificacion publica de mascotas: codigo unico, cartel/QR, mensajes de hallazgo
-- y solicitud de chapita fisica.

-- 1) Codigo publico unico por mascota -----------------------------------------

alter table public.pets
  add column if not exists public_code text;

create or replace function public.generate_pet_public_code()
returns text
language plpgsql
as $$
declare
  candidate text;
  exists_already boolean;
begin
  loop
    -- Codigo corto, legible y suficientemente unico (base36 de un uuid random).
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    select exists(select 1 from public.pets where public_code = candidate) into exists_already;
    exit when not exists_already;
  end loop;
  return candidate;
end;
$$;

create or replace function public.set_pet_public_code()
returns trigger
language plpgsql
as $$
begin
  if new.public_code is null then
    new.public_code := public.generate_pet_public_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_pet_public_code on public.pets;
create trigger trg_set_pet_public_code
  before insert on public.pets
  for each row
  execute function public.set_pet_public_code();

-- Backfill de mascotas existentes sin codigo.
update public.pets
set public_code = public.generate_pet_public_code()
where public_code is null;

alter table public.pets
  alter column public_code set not null;

create unique index if not exists idx_pets_public_code on public.pets(public_code);

-- 2) Mensajes de hallazgo (desde cartel o chapita) -----------------------------

create table if not exists public.pet_sighting_messages (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  source text not null check (source in ('cartel', 'chapita')),
  message text,
  contact_info text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  read_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create index if not exists idx_pet_sighting_messages_pet_id on public.pet_sighting_messages(pet_id);
create index if not exists idx_pet_sighting_messages_created_at on public.pet_sighting_messages(created_at desc);

alter table public.pet_sighting_messages enable row level security;

-- Solo el dueño de la mascota puede ver/actualizar sus mensajes. La insercion
-- publica (desde la pagina del cartel/chapita, sin sesion) se hace exclusivamente
-- a traves de la funcion edge con service role, nunca directo desde el cliente.
drop policy if exists "Owners can view sighting messages of their pets" on public.pet_sighting_messages;
create policy "Owners can view sighting messages of their pets"
  on public.pet_sighting_messages
  for select
  using (
    exists(
      select 1 from public.pets where pets.id = pet_sighting_messages.pet_id and pets.user_id = auth.uid()
    )
  );

drop policy if exists "Owners can update sighting messages of their pets" on public.pet_sighting_messages;
create policy "Owners can update sighting messages of their pets"
  on public.pet_sighting_messages
  for update
  using (
    exists(
      select 1 from public.pets where pets.id = pet_sighting_messages.pet_id and pets.user_id = auth.uid()
    )
  );

-- 3) Solicitudes de chapita fisica ---------------------------------------------

create table if not exists public.pet_tag_requests (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'processing', 'shipped', 'delivered', 'cancelled')),
  shipping_address text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_pet_tag_requests_pet_id on public.pet_tag_requests(pet_id);
create index if not exists idx_pet_tag_requests_user_id on public.pet_tag_requests(user_id);

alter table public.pet_tag_requests enable row level security;

drop policy if exists "Owners can view their tag requests" on public.pet_tag_requests;
create policy "Owners can view their tag requests"
  on public.pet_tag_requests
  for select
  using (auth.uid() = user_id);

drop policy if exists "Owners can insert tag requests for their pets" on public.pet_tag_requests;
create policy "Owners can insert tag requests for their pets"
  on public.pet_tag_requests
  for insert
  with check (
    auth.uid() = user_id
    and exists(select 1 from public.pets where pets.id = pet_tag_requests.pet_id and pets.user_id = auth.uid())
  );
