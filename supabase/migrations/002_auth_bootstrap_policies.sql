-- Permite crear perfil y suscripcion inicial desde el cliente autenticado.
create policy "Users can insert their own profile" on public.users
  for insert with check (auth.uid() = id);

create policy "Users can insert their own subscription" on public.subscriptions
  for insert with check (auth.uid() = user_id);
