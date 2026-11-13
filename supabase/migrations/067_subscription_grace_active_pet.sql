begin;

-- 067: Periodo de gracia, cancelacion pendiente, mascota activa en Free y
-- proteccion de mascotas en modo solo lectura con excepcion de recuperacion.
--
-- ESTADO: PREPARADA (Fase 7.2). NO APLICAR sin autorizacion.
-- Requiere: 066_beneficios_products_admin_rls.sql aplicada previamente
-- (guard de users.access_mode).
--
-- Fuente de verdad de la regla de acceso: supabase/functions/_shared/premiumAccess.mjs
-- (resolveAccessState). public.user_premium_effective() replica aqui la decision
-- de "acceso completo" (premium | canceled_pending | grace); la paridad se
-- verifica en supabase/tests/068_subscription_pet_access.test.sql.
--
-- Decisiones de diseño:
-- * El bloqueo de mascotas NO se almacena por mascota: se deriva de
--   (estado de suscripcion, users.active_pet_id). Al recuperar Premium todas
--   las mascotas vuelven a ser escribibles automaticamente, sin updates
--   masivos, sin duplicados y sin re-seleccion.
-- * La gracia es un dato explicito (grace_until) que solo escribe el flujo de
--   facturacion / admin; nunca se infiere de un estado de pago.
-- * El limite de creacion de mascotas en Free (1) se mantiene por ahora solo
--   en frontend: imponerlo en RLS romperia la migracion guest->auth de
--   useSupabaseSync (inserta N mascotas en una cuenta free). Se endurecera en
--   una migracion posterior junto con un RPC de migracion dedicado (Etapa 5).
--   Mitigacion: una mascota extra creada por API directa nace protegida
--   (no escribible), por lo que el abuso no otorga funcionalidad.

-- ============================================================================
-- 1) subscriptions: gracia explicita y cancelacion voluntaria diferida
-- ============================================================================

alter table public.subscriptions
  add column if not exists grace_until timestamp with time zone,
  add column if not exists cancel_requested_at timestamp with time zone;

comment on column public.subscriptions.grace_until is
  'Fin del periodo de gracia autorizado explicitamente por facturacion tras un pago rechazado/pausado. Nunca se infiere.';
comment on column public.subscriptions.cancel_requested_at is
  'Momento en que el usuario pidio cancelar. Con expires_at vigente => canceled_pending (acceso completo hasta vencer). Bloquea la gracia.';

-- La gracia solo tiene sentido ligada a un plan premium. El cron de ciclo de
-- vida debe limpiar grace_until en el mismo update que degrade plan a 'free'.
alter table public.subscriptions
  drop constraint if exists subscriptions_grace_requires_premium;
alter table public.subscriptions
  add constraint subscriptions_grace_requires_premium
  check (grace_until is null or plan = 'premium');

-- Indices parciales para el cron de ciclo de vida (busca vencimientos).
create index if not exists idx_subscriptions_grace_until
  on public.subscriptions(grace_until) where grace_until is not null;
create index if not exists idx_subscriptions_expires_at
  on public.subscriptions(expires_at) where expires_at is not null;
create index if not exists idx_subscriptions_cancel_requested_at
  on public.subscriptions(cancel_requested_at) where cancel_requested_at is not null;

-- Duracion del periodo de gracia, configurable desde Admin (usada por el
-- webhook de facturacion, no por las funciones de esta migracion).
alter table public.billing_pricing_settings
  add column if not exists grace_period_days integer not null default 7;
alter table public.billing_pricing_settings
  drop constraint if exists billing_pricing_settings_grace_period_days_range;
alter table public.billing_pricing_settings
  add constraint billing_pricing_settings_grace_period_days_range
  check (grace_period_days between 0 and 30);

-- ============================================================================
-- 2) users.active_pet_id: unica mascota escribible en plan Free
-- ============================================================================

alter table public.users
  add column if not exists active_pet_id uuid references public.pets(id) on delete set null,
  add column if not exists active_pet_changed_at timestamp with time zone;

comment on column public.users.active_pet_id is
  'Mascota con permisos de escritura en plan Free. Irrelevante con acceso Premium efectivo (todas escribibles). on delete set null: si se elimina, el usuario vuelve a estado "sin seleccion".';
comment on column public.users.active_pet_changed_at is
  'Ultimo cambio de mascota activa sujeto a cooldown (solo cambios no-Premium). Gobierna el limite de 1 cambio cada 30 dias.';

create index if not exists idx_users_active_pet_id
  on public.users(active_pet_id) where active_pet_id is not null;

-- 066 revoca UPDATE de users salvo columnas de perfil; el cliente necesita
-- poder elegir su mascota activa. active_pet_changed_at NO se otorga: la
-- escribe unicamente el trigger de guard (cooldown no manipulable).
grant update (active_pet_id) on table public.users to authenticated;

-- Nota de seguridad: grace_until y cancel_requested_at quedan fuera del
-- alcance del cliente sin cambios extra: 066 ya bloquea todo UPDATE de
-- subscriptions para authenticated (policy restrictiva + guard trigger).
-- Solo facturacion (service role) y los RPC admin pueden escribirlos.

-- Backfill: autoseleccion silenciosa para usuarios con exactamente 1 mascota
-- (incluye Free actuales; en Premium no tiene efecto). No inicia cooldown.
update public.users u
set active_pet_id = s.only_pet_id
from (
  select user_id, (array_agg(id))[1] as only_pet_id
  from public.pets
  group by user_id
  having count(*) = 1
) s
where s.user_id = u.id
  and u.active_pet_id is null;

-- ============================================================================
-- 3) Funciones de acceso (paridad con premiumAccess.mjs)
-- ============================================================================

-- Acceso completo efectivo: premium vigente, cancelacion con periodo pagado
-- vigente (canceled_pending) o gracia explicita vigente. Falla cerrado.
-- Paridad con isPremiumOrGraceEffective() de premiumAccess.mjs:
--   * access_mode debe ser 'premium' (guest/free => false).
--   * Sin fila de suscripcion => alta admin sin vencimiento (true).
--   * Premium normal: plan 'premium' + is_active + (expires_at null o futuro
--     estricto). cancel_requested_at no quita acceso mientras este vigente.
--   * Gracia: plan 'premium' + grace_until futuro estricto + SIN cancelacion
--     (la cancelacion voluntaria nunca recibe gracia).
create or replace function public.user_premium_effective(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select u.access_mode = 'premium'
      and (
        s.user_id is null
        or (
          s.plan = 'premium'
          and s.is_active
          and (s.expires_at is null or now() < s.expires_at)
        )
        or (
          s.plan = 'premium'
          and s.cancel_requested_at is null
          and s.grace_until is not null
          and now() < s.grace_until
        )
      )
    from public.users u
    left join public.subscriptions s on s.user_id = u.id
    where u.id = p_user
  ), false);
$$;

revoke all on function public.user_premium_effective(uuid) from public, anon;
grant execute on function public.user_premium_effective(uuid) to authenticated, service_role;

-- Escritura permitida sobre una mascota para el usuario autenticado:
--   dueño AND ( acceso completo efectivo
--               OR es la mascota activa elegida
--               OR es su unica mascota (sin friccion para Free de siempre) ).
create or replace function public.pet_is_writable(p_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pets p
    join public.users u on u.id = p.user_id
    where p.id = p_pet
      and p.user_id = auth.uid()
      and (
        public.user_premium_effective(p.user_id)
        or u.active_pet_id = p.id
        or not exists (
          select 1 from public.pets p2
          where p2.user_id = p.user_id and p2.id <> p.id
        )
      )
  );
$$;

revoke all on function public.pet_is_writable(uuid) from public, anon;
grant execute on function public.pet_is_writable(uuid) to authenticated, service_role;

-- ============================================================================
-- 4) Guard de active_pet_id: propiedad + cooldown anti-abuso
-- ============================================================================

-- Reglas:
-- * La mascota activa debe pertenecer al propio usuario (siempre).
-- * Cooldown de 30 dias para TODA transicion hacia una mascota (valor no nulo)
--   hecha por el propio usuario sin acceso Premium efectivo, incluso cuando
--   OLD.active_pet_id es null: asi se cierra la rotacion A -> null -> B ->
--   null -> C detectada en la auditoria 7.2.1 (CRITICO-1).
-- * Toda seleccion self no-premium de una mascota registra
--   active_pet_changed_at. Pasar a null NO borra ni reinicia el timestamp.
-- * Primera seleccion tras el downgrade sigue libre: los cambios en Premium no
--   registran timestamp, por lo que al caer a Free active_pet_changed_at esta
--   en null (o vencido) y la primera seleccion pasa; a partir de ahi rige el
--   cooldown.
-- * Si se ELIMINA la mascota activa, trg_reset_active_pet_cooldown (en pets)
--   limpia el timestamp para poder elegir reemplazo de inmediato (MEDIO-2).
-- * service role / backoffice (auth.uid() distinto del dueño o null) no esta
--   sujeto a cooldown, solo a propiedad, y no registra timestamp.
create or replace function public.guard_user_active_pet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active_pet_id is distinct from old.active_pet_id then
    if new.active_pet_id is not null and not exists (
      select 1 from public.pets p
      where p.id = new.active_pet_id and p.user_id = new.id
    ) then
      raise exception 'active_pet_id debe referenciar una mascota del propio usuario';
    end if;

    if new.active_pet_id is not null
       and auth.uid() = new.id
       and not public.user_premium_effective(new.id)
    then
      if old.active_pet_changed_at is not null
         and old.active_pet_changed_at > now() - interval '30 days'
      then
        raise exception 'La mascota activa solo puede cambiarse una vez cada 30 dias';
      end if;
      -- Toda seleccion (incluida la que parte de null) registra el timestamp:
      -- la rotacion via null ya no evade el cooldown.
      new.active_pet_changed_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_user_active_pet() from public, anon, authenticated;

drop trigger if exists trg_guard_user_active_pet on public.users;
create trigger trg_guard_user_active_pet
  before update of active_pet_id on public.users
  for each row execute function public.guard_user_active_pet();

-- Reseteo del cooldown al ELIMINAR la mascota activa (MEDIO-2, auditoria
-- 7.2.1): si el usuario borra su mascota activa debe poder elegir otra de
-- inmediato, sin esperar los 30 dias.
--
-- Orden de ejecucion: BEFORE DELETE (row) en pets corre antes del borrado y
-- antes de la accion referencial ON DELETE SET NULL de users.active_pet_id,
-- por lo que users.active_pet_id todavia apunta a la mascota y permite saber
-- si la eliminada era la activa. El UPDATE interno solo toca
-- active_pet_changed_at, que no esta en la lista de columnas de
-- trg_guard_user_active_pet (before update OF active_pet_id), asi que no
-- dispara el guard ni crea recursion.
--
-- Seguridad: security definer (el cliente no tiene grant de UPDATE sobre
-- active_pet_changed_at) con search_path fijado y EXECUTE revocado. Solo se
-- alcanza via DELETE sobre pets, que RLS restringe al dueño (o service role):
-- una eliminacion ajena no puede reiniciar el cooldown de otro usuario, y el
-- usuario tampoco puede resetear el timestamp con un UPDATE directo. Resetear
-- borrando la propia mascota activa es autodestructivo (pierde sus datos), por
-- lo que no constituye una via practica de rotacion.
create or replace function public.reset_active_pet_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set active_pet_changed_at = null
  where id = old.user_id
    and active_pet_id = old.id;
  return old;
end;
$$;

revoke all on function public.reset_active_pet_cooldown() from public, anon, authenticated;

drop trigger if exists trg_reset_active_pet_cooldown on public.pets;
create trigger trg_reset_active_pet_cooldown
  before delete on public.pets
  for each row execute function public.reset_active_pet_cooldown();

-- ============================================================================
-- 5) Proteccion de escritura por mascota (RLS plan-aware)
-- ============================================================================
-- SELECT no cambia en ninguna tabla: las mascotas protegidas siguen siendo
-- visibles y consultables (ficha, historial, agenda, vacunas, peso, chat).
-- DELETE de la mascota tampoco cambia: es decision del dueño, nunca forzada.

-- 5a) pets: UPDATE con excepcion de recuperacion por columnas.
-- La politica RLS sigue siendo de pertenencia; un trigger BEFORE UPDATE
-- aplica la granularidad por columna: en una mascota protegida solo pueden
-- cambiar los datos minimos de recuperacion (foto y señas particulares).
-- Cualquier columna futura queda protegida por defecto (comparacion jsonb).
create or replace function public.enforce_pet_write_protection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  -- service role / jobs internos (sin JWT de usuario): sin restriccion.
  if auth.uid() is null then
    return new;
  end if;

  if public.pet_is_writable(old.id) then
    return new;
  end if;

  -- Excepcion de recuperacion de mascota perdida: en mascotas protegidas solo
  -- pueden cambiar photo_url y distinguishing_marks (datos del cartel/QR).
  -- NO desbloquea historial clinico, agenda, medicacion ni Consultorio IA.
  v_old := to_jsonb(old) - 'photo_url' - 'distinguishing_marks' - 'updated_at';
  v_new := to_jsonb(new) - 'photo_url' - 'distinguishing_marks' - 'updated_at';
  if v_old is distinct from v_new then
    raise exception 'Mascota protegida en plan Free: solo se pueden actualizar los datos de recuperacion (foto y señas particulares)';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_pet_write_protection() from public, anon, authenticated;

drop trigger if exists trg_enforce_pet_write_protection on public.pets;
create trigger trg_enforce_pet_write_protection
  before update on public.pets
  for each row execute function public.enforce_pet_write_protection();

-- 5b) clinical_entries: escrituras solo sobre mascotas escribibles.
drop policy if exists "Users can insert clinical entries for their pets" on public.clinical_entries;
create policy "Users can insert clinical entries for writable pets" on public.clinical_entries
  for insert with check (public.pet_is_writable(pet_id));

drop policy if exists "Users can update clinical entries of their pets" on public.clinical_entries;
create policy "Users can update clinical entries of writable pets" on public.clinical_entries
  for update using (public.pet_is_writable(pet_id));

drop policy if exists "Users can delete clinical entries of their pets" on public.clinical_entries;
create policy "Users can delete clinical entries of writable pets" on public.clinical_entries
  for delete using (public.pet_is_writable(pet_id));

-- 5c) preventive_tasks (agenda/vacunas/medicacion): idem.
drop policy if exists "Users can insert preventive tasks for their pets" on public.preventive_tasks;
create policy "Users can insert preventive tasks for writable pets" on public.preventive_tasks
  for insert with check (public.pet_is_writable(pet_id));

drop policy if exists "Users can update preventive tasks of their pets" on public.preventive_tasks;
create policy "Users can update preventive tasks of writable pets" on public.preventive_tasks
  for update using (public.pet_is_writable(pet_id));

drop policy if exists "Users can delete preventive tasks of their pets" on public.preventive_tasks;
create policy "Users can delete preventive tasks of writable pets" on public.preventive_tasks
  for delete using (public.pet_is_writable(pet_id));

-- 5d) pet_weight_logs: idem (no existia policy de update).
drop policy if exists "Users can insert weight logs for their pets" on public.pet_weight_logs;
create policy "Users can insert weight logs for writable pets" on public.pet_weight_logs
  for insert with check (public.pet_is_writable(pet_id));

drop policy if exists "Users can delete weight logs of their pets" on public.pet_weight_logs;
create policy "Users can delete weight logs of writable pets" on public.pet_weight_logs
  for delete using (public.pet_is_writable(pet_id));

-- 5e) chat_messages (Consultorio IA): sin mensajes nuevos sobre protegidas.
-- El historial sigue legible (SELECT intacto). pet_id null (mensajes globales
-- legacy) conserva la regla de pertenencia.
drop policy if exists "Users can insert their own chat messages" on public.chat_messages;
create policy "Users can insert their own chat messages" on public.chat_messages
  for insert with check (
    auth.uid() = user_id
    and (chat_messages.pet_id is null or public.pet_is_writable(chat_messages.pet_id))
  );

-- 5f) Dominio de recuperacion: SIN CAMBIOS deliberados.
--   * pet_sighting_messages: ver/marcar leido sigue por pertenencia (034);
--     la insercion publica sigue via edge function con service role.
--   * pet_tag_codes: vincular/desvincular chapita pasa por funciones
--     security definer (039) con chequeo de pertenencia; sigue disponible
--     para mascotas protegidas.
--   * pet_tag_requests: pertenencia (034); el gating Premium de la compra de
--     chapita vive en el frontend/hook y es un eje independiente del bloqueo.
--   * El cartel PDF/imagen se genera en frontend sin escritura en DB.
--     DECISION DE PRODUCTO (Fase 7.2.2, para Etapa 5): un usuario Free puede
--     generar el cartel de busqueda de CUALQUIERA de sus mascotas, incluso
--     protegidas. Requiere quitar el gating de isPremiumUser en
--     generatePosterPdf/generatePosterImage de usePetIdentification.ts
--     (solo esos dos; requestTag sigue siendo Premium). No habilita escritura
--     ni crea autorizacion Premium: no requiere cambios en esta migracion.
--   * Los datos de contacto del tutor (users.whatsapp_phone, etc.) no
--     dependen de la mascota y siguen editables.

-- ============================================================================
-- 6) admin_set_user_access: sincronizacion completa de estados administrativos
-- ============================================================================
-- Corrige: el upsert anterior no tocaba expires_at, por lo que un alta manual
-- premium podia quedar vencida por un expires_at viejo (isPremiumEffective =>
-- false). Ahora cada estado administrativo deja la fila completa y coherente:
--   premium => plan premium, activa, sin vencimiento, sin gracia, sin cancelacion
--   free    => plan free, activa, limpia
--   guest   => plan free, inactiva, limpia
create or replace function public.admin_set_user_access(p_user_id uuid, p_access text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  if p_access not in ('guest', 'free', 'premium') then
    raise exception 'Acceso invalido';
  end if;

  update public.users
  set access_mode = p_access,
      updated_at = now()
  where id = p_user_id;

  insert into public.subscriptions (user_id, plan, is_active, expires_at, grace_until, cancel_requested_at, updated_at)
  values (
    p_user_id,
    case when p_access = 'premium' then 'premium' else 'free' end,
    p_access <> 'guest',
    null, null, null,
    now()
  )
  on conflict (user_id) do update
    set plan = excluded.plan,
        is_active = excluded.is_active,
        expires_at = null,
        grace_until = null,
        cancel_requested_at = null,
        updated_at = now();
end;
$$;

grant execute on function public.admin_set_user_access(uuid, text) to authenticated;

-- ============================================================================
-- ROLLBACK (manual, en orden inverso; conservar como referencia)
-- ============================================================================
-- begin;
-- -- 6) restaurar admin_set_user_access segun 005_admin_user_access.sql.
-- -- 5e) restaurar policy de chat segun 011_chat_messages_by_pet.sql.
-- -- 5b-5d) recrear policies originales de pertenencia (001 y 028):
-- --   clinical_entries / preventive_tasks: insert/update/delete con
-- --     exists(select 1 from pets where pets.id = <t>.pet_id and pets.user_id = auth.uid())
-- --   pet_weight_logs: insert/delete con la misma condicion.
-- -- 5a) drop trigger trg_enforce_pet_write_protection on public.pets;
-- --     drop function public.enforce_pet_write_protection();
-- -- 4b) drop trigger if exists trg_reset_active_pet_cooldown on public.pets;
-- --     drop function if exists public.reset_active_pet_cooldown();
-- -- 4) drop trigger trg_guard_user_active_pet on public.users;
-- --    drop function public.guard_user_active_pet();
-- -- 3) drop function public.pet_is_writable(uuid);
-- --    drop function public.user_premium_effective(uuid);
-- -- 2) alter table public.users drop column active_pet_changed_at, drop column active_pet_id;
-- -- 1) alter table public.billing_pricing_settings drop constraint billing_pricing_settings_grace_period_days_range,
-- --      drop column grace_period_days;
-- --    alter table public.subscriptions drop constraint subscriptions_grace_requires_premium;
-- --    drop index idx_subscriptions_grace_until; drop index idx_subscriptions_expires_at;
-- --    drop index idx_subscriptions_cancel_requested_at;
-- --    alter table public.subscriptions drop column cancel_requested_at, drop column grace_until;
-- commit;

commit;
