-- Tabla de usuarios (perfil extendido)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Tabla de mascotas
create table public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  breed text not null,
  species text not null check (species in ('dog', 'cat', 'other')),
  sex text not null check (sex in ('male', 'female', 'unknown')),
  age_years integer not null default 0,
  age_months integer not null default 0,
  weight_kg numeric(5,2) not null,
  photo_url text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Tabla de historial clínico
create table public.clinical_entries (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  category text not null check (category in ('medication', 'deworming', 'vaccine', 'treatment', 'clinical_note')),
  title text not null,
  description text not null,
  event_date date not null,
  metadata jsonb,
  created_at timestamp with time zone default now()
);

-- Tabla de tareas preventivas
create table public.preventive_tasks (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  title text not null,
  category text not null check (category in ('medication', 'vaccine', 'deworming', 'appointment', 'feeding', 'other')),
  due_date date not null,
  completed boolean default false,
  notes text,
  metadata jsonb,
  created_at timestamp with time zone default now()
);

-- Tabla de chat (IA)
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant')),
  content text not null,
  created_at timestamp with time zone default now()
);

-- Tabla de suscripción
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  is_active boolean default false,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Índices para performance
create index idx_pets_user_id on public.pets(user_id);
create index idx_clinical_entries_pet_id on public.clinical_entries(pet_id);
create index idx_clinical_entries_event_date on public.clinical_entries(event_date);
create index idx_preventive_tasks_pet_id on public.preventive_tasks(pet_id);
create index idx_chat_messages_user_id on public.chat_messages(user_id);

-- Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.pets enable row level security;
alter table public.clinical_entries enable row level security;
alter table public.preventive_tasks enable row level security;
alter table public.chat_messages enable row level security;
alter table public.subscriptions enable row level security;

-- Políticas para users
create policy "Users can view their own profile" on public.users
  for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.users
  for update using (auth.uid() = id);

-- Políticas para pets
create policy "Users can view their own pets" on public.pets
  for select using (auth.uid() = user_id);
create policy "Users can insert their own pets" on public.pets
  for insert with check (auth.uid() = user_id);
create policy "Users can update their own pets" on public.pets
  for update using (auth.uid() = user_id);
create policy "Users can delete their own pets" on public.pets
  for delete using (auth.uid() = user_id);

-- Políticas para clinical_entries
create policy "Users can view clinical entries of their pets" on public.clinical_entries
  for select using (
    exists(
      select 1 from public.pets where pets.id = clinical_entries.pet_id and pets.user_id = auth.uid()
    )
  );
create policy "Users can insert clinical entries for their pets" on public.clinical_entries
  for insert with check (
    exists(
      select 1 from public.pets where pets.id = clinical_entries.pet_id and pets.user_id = auth.uid()
    )
  );
create policy "Users can update clinical entries of their pets" on public.clinical_entries
  for update using (
    exists(
      select 1 from public.pets where pets.id = clinical_entries.pet_id and pets.user_id = auth.uid()
    )
  );
create policy "Users can delete clinical entries of their pets" on public.clinical_entries
  for delete using (
    exists(
      select 1 from public.pets where pets.id = clinical_entries.pet_id and pets.user_id = auth.uid()
    )
  );

-- Políticas para preventive_tasks
create policy "Users can view preventive tasks of their pets" on public.preventive_tasks
  for select using (
    exists(
      select 1 from public.pets where pets.id = preventive_tasks.pet_id and pets.user_id = auth.uid()
    )
  );
create policy "Users can insert preventive tasks for their pets" on public.preventive_tasks
  for insert with check (
    exists(
      select 1 from public.pets where pets.id = preventive_tasks.pet_id and pets.user_id = auth.uid()
    )
  );
create policy "Users can update preventive tasks of their pets" on public.preventive_tasks
  for update using (
    exists(
      select 1 from public.pets where pets.id = preventive_tasks.pet_id and pets.user_id = auth.uid()
    )
  );
create policy "Users can delete preventive tasks of their pets" on public.preventive_tasks
  for delete using (
    exists(
      select 1 from public.pets where pets.id = preventive_tasks.pet_id and pets.user_id = auth.uid()
    )
  );

-- Políticas para chat_messages
create policy "Users can view their own chat messages" on public.chat_messages
  for select using (auth.uid() = user_id);
create policy "Users can insert their own chat messages" on public.chat_messages
  for insert with check (auth.uid() = user_id);

-- Políticas para subscriptions
create policy "Users can view their own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);
create policy "Users can update their own subscription" on public.subscriptions
  for update using (auth.uid() = user_id);
