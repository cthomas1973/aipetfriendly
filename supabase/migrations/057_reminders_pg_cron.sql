-- Dispara send-preventive-reminders desde el propio Postgres (pg_cron + pg_net)
-- cada 1 minuto, en vez de depender solo del cron de GitHub Actions (cada 30 min,
-- con posibles demoras adicionales de la cola de GitHub). Reduce la latencia
-- maxima de "tarea vencida -> aviso enviado" de ~30 min a ~1 min.
--
-- Requiere que exista un secreto en Supabase Vault llamado 'reminders_api_key'
-- con el mismo valor que REMINDERS_API_KEY (ya usado por el workflow de GitHub).
-- Ese secreto NO se crea aca (no debe quedar en el historial de git): se crea
-- una sola vez a mano desde el SQL Editor del dashboard de Supabase con:
--
--   select vault.create_secret('<valor-real-de-REMINDERS_API_KEY>', 'reminders_api_key');
--
-- El workflow de GitHub Actions (.github/workflows/send-reminders.yml, cada 30 min)
-- se deja como respaldo: gracias a claimSlot()/notification_logs, invocar la
-- funcion mas de una vez no genera avisos duplicados.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-preventive-reminders-1min') then
    perform cron.unschedule('send-preventive-reminders-1min');
  end if;
end $$;

select cron.schedule(
  'send-preventive-reminders-1min',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://apejkczbthvbxoksmlye.supabase.co/functions/v1/send-preventive-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminders-key', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_api_key' limit 1)
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'reminders_api_key');
  $$
);
