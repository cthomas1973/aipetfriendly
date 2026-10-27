begin;
create function public.retry_retained_blog_generation(p_run_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare state_row public.blog_generation_state%rowtype;
begin
  select * into state_row from public.blog_generation_state where singleton for update;
  if state_row.active_run_id is not null then raise exception 'Ya existe una corrida activa'; end if;
  if state_row.last_success_at is not null and state_row.last_success_at + interval '36 hours' > now() then raise exception 'Intervalo de 36 horas aun vigente'; end if;
  if not exists (select 1 from public.blog_generation_runs where id = p_run_id and stage = 'retained') then raise exception 'La corrida no esta retenida'; end if;
  if (select count(*) from public.blog_generation_runs where created_at > now() - interval '1 hour') >= 3 then raise exception 'Limite de reintentos por hora'; end if;
  update public.blog_generation_state set next_eligible_at = now() where singleton;
  return true;
end;
$$;
revoke all on function public.retry_retained_blog_generation(uuid) from public, anon, authenticated;
grant execute on function public.retry_retained_blog_generation(uuid) to service_role;

create or replace function public.save_blog_generation_stage(p_id uuid, p_token uuid, p_stage text, p_payload jsonb, p_error text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare run_row public.blog_generation_runs%rowtype;
begin
  perform 1 from public.blog_generation_state where singleton for update;
  select * into run_row from public.blog_generation_runs where id = p_id for update;
  if not found or p_token is null or run_row.lease_token is distinct from p_token or run_row.lease_until is null
    or run_row.lease_until < now() or not exists (select 1 from public.blog_generation_state where singleton and active_run_id = p_id)
    then raise exception 'Reserva de generacion vencida'; end if;
  if p_stage not in ('text','cover','infographic','finalize','retained') then raise exception 'Etapa invalida'; end if;
  update public.blog_generation_runs set stage = p_stage, payload = p_payload, error = left(p_error, 1000),
    attempts = case when p_error is null then 0 else attempts end,
    retry_at = case when p_error is null then now() else now() + interval '5 minutes' end,
    lease_token = null, lease_until = null where id = p_id;
  if p_stage = 'retained' then
    update public.blog_generation_state set active_run_id = null,
      next_eligible_at = greatest(coalesce(last_success_at + interval '36 hours', now()), now() + interval '1 hour') where singleton;
  end if;
  return true;
end;
$$;
commit;