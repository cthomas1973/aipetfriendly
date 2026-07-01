-- Asociar cada mensaje de chat con una mascota para evitar mezclar historiales

alter table public.chat_messages
  add column if not exists pet_id uuid references public.pets(id) on delete cascade;

create index if not exists idx_chat_messages_pet_id on public.chat_messages(pet_id);

drop policy if exists "Users can insert their own chat messages" on public.chat_messages;
create policy "Users can insert their own chat messages" on public.chat_messages
  for insert with check (
    auth.uid() = user_id
    and (
      pet_id is null
      or exists(
        select 1
        from public.pets
        where pets.id = chat_messages.pet_id
          and pets.user_id = auth.uid()
      )
    )
  );

update public.chat_messages cm
set pet_id = p.id
from public.pets p
where cm.pet_id is null
  and cm.user_id = p.user_id
  and (
    cm.content ilike '%' || p.name || '%'
    or exists (
      select 1
      from public.chat_messages cm2
      where cm2.user_id = cm.user_id
        and cm2.role = 'assistant'
        and cm2.content ilike '%' || p.name || '%'
        and abs(extract(epoch from (cm2.created_at - cm.created_at))) <= 300
    )
  );