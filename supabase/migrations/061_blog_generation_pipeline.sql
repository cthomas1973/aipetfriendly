begin;

create table public.blog_generation_runs (
  id uuid primary key default gen_random_uuid(),
  stage text not null default 'text' check (stage in ('text','cover','infographic','finalize','complete','retained')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  retry_at timestamptz not null default now(),
  error text,
  origin text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.blog_generation_runs enable row level security;

create table public.blog_generation_state (
  singleton boolean primary key default true check (singleton),
  active_run_id uuid references public.blog_generation_runs(id),
  last_success_at timestamptz,
  next_eligible_at timestamptz not null default now()
);
alter table public.blog_generation_state enable row level security;
insert into public.blog_generation_state(singleton) values (true);

alter table public.blog_posts
  add column editorial_metadata jsonb,
  add column generation_run_id uuid references public.blog_generation_runs(id);
create unique index blog_posts_generation_run_unique on public.blog_posts(generation_run_id);

create function public.claim_blog_generation(p_origin text default 'scheduled')
returns public.blog_generation_runs language plpgsql security definer set search_path = public as $$
declare
  state_row public.blog_generation_state%rowtype;
  run_row public.blog_generation_runs%rowtype;
begin
  select * into state_row from public.blog_generation_state where singleton for update;
  if state_row.active_run_id is not null then
    select * into run_row from public.blog_generation_runs where id = state_row.active_run_id for update;
    if run_row.lease_until > now() or run_row.retry_at > now() then return null; end if;
    if run_row.attempts >= 3 then
      update public.blog_generation_runs set stage = 'retained', error = coalesce(error, 'Reserva vencida tras tres intentos'), lease_token = null, lease_until = null where id = run_row.id;
      update public.blog_generation_state set active_run_id = null, next_eligible_at = greatest(coalesce(last_success_at + interval '36 hours', now()), now() + interval '1 hour') where singleton;
      return null;
    end if;
  else
    if state_row.next_eligible_at > now() then return null; end if;
    insert into public.blog_generation_runs(origin) values (left(p_origin, 60)) returning * into run_row;
    update public.blog_generation_state set active_run_id = run_row.id where singleton;
  end if;
  update public.blog_generation_runs
    set lease_token = gen_random_uuid(), lease_until = now() + interval '5 minutes', attempts = attempts + 1
    where id = run_row.id returning * into run_row;
  return run_row;
end;
$$;

create function public.save_blog_generation_stage(p_id uuid, p_token uuid, p_stage text, p_payload jsonb, p_error text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare run_row public.blog_generation_runs%rowtype;
begin
  perform 1 from public.blog_generation_state where singleton for update;
  select * into run_row from public.blog_generation_runs where id = p_id for update;
  if not found or run_row.lease_token is distinct from p_token or run_row.lease_until < now() then raise exception 'Reserva de generacion vencida'; end if;
  if p_stage not in ('text','cover','infographic','finalize','retained') then raise exception 'Etapa invalida'; end if;
  update public.blog_generation_runs
    set stage = p_stage, payload = p_payload, error = left(p_error, 1000),
        attempts = case when p_error is null then 0 else attempts end,
        retry_at = case when p_error is null then now() else now() + interval '5 minutes' end,
        lease_token = null, lease_until = null
    where id = p_id;
  if p_stage = 'retained' then
    update public.blog_generation_state set active_run_id = null,
      next_eligible_at = greatest(coalesce(last_success_at + interval '36 hours', now()), now() + interval '1 hour') where singleton;
  end if;
  return true;
end;
$$;

create function public.finish_blog_generation(p_id uuid, p_token uuid)
returns public.blog_posts language plpgsql security definer set search_path = public as $$
declare
  run_row public.blog_generation_runs%rowtype;
  article jsonb;
  public_metadata jsonb;
  post_row public.blog_posts%rowtype;
begin
  perform 1 from public.blog_generation_state where singleton for update;
  select * into run_row from public.blog_generation_runs where id = p_id for update;
  select * into post_row from public.blog_posts where generation_run_id = p_id;
  if found then return post_row; end if;
  if run_row.lease_token is distinct from p_token or run_row.lease_until < now() or run_row.stage <> 'finalize' then raise exception 'Reserva de generacion invalida'; end if;
  article := run_row.payload;
  if article #>> '{quality,ready}' is distinct from 'true'
    or coalesce(article->>'cover_url', '') = '' or coalesce(article->>'infographic_url', '') = ''
    or jsonb_array_length(coalesce(article->'sources', '[]'::jsonb)) < 1 then raise exception 'Borrador incompleto'; end if;
  if exists (select 1 from public.blog_posts where lower(btrim(title)) = lower(btrim(article->>'title'))
    or slug = article->>'slug' or md5(content) = md5(article->>'content')
    or (topic = article->>'topic' and created_at > now() - interval '90 days')) then raise exception 'Articulo duplicado'; end if;
  public_metadata := jsonb_set(article, '{sources}', (select jsonb_agg(source - 'text') from jsonb_array_elements(article->'sources') source));
  insert into public.blog_posts(title, slug, content, status, image_url, source_name, estimated_reading_time, meta_description, topic, editorial_metadata, generation_run_id)
  values (article->>'title', article->>'slug', article->>'content', 'draft', article->>'cover_url', article->>'source_name',
    greatest(1, ceil(array_length(regexp_split_to_array(article->>'content', '\s+'), 1) / 200.0)::integer),
    article->>'meta_description', article->>'topic', public_metadata, p_id) returning * into post_row;
  update public.blog_generation_runs set stage = 'complete', completed_at = now(), lease_token = null, lease_until = null, error = null where id = p_id;
  update public.blog_generation_state set active_run_id = null, last_success_at = now(), next_eligible_at = now() + interval '36 hours' where singleton;
  return post_row;
end;
$$;

create function public.guard_generated_blog_publication()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'published' and new.generation_run_id is not null then
    if new.editorial_metadata #>> '{quality,ready}' is distinct from 'true'
      or new.editorial_metadata->>'content' is distinct from new.content
      or new.editorial_metadata->>'title' is distinct from new.title
      or coalesce(new.image_url, '') = ''
      or coalesce(new.editorial_metadata->>'infographic_url', '') = ''
      or new.editorial_metadata #>> '{quality,veterinaryReviewRequired}' = 'true' then
      raise exception 'El articulo requiere revalidacion editorial o veterinaria antes de publicarse';
    end if;
  end if;
  return new;
end;
$$;
create trigger generated_blog_publication_guard before insert or update on public.blog_posts
  for each row execute function public.guard_generated_blog_publication();

create function public.admin_list_blog_generation_runs()
returns setof public.blog_generation_runs language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then raise exception 'No autorizado'; end if;
  return query select * from public.blog_generation_runs order by created_at desc limit 30;
end;
$$;

create function public.configure_blog_generation_schedule(p_secret text)
returns bigint language plpgsql security definer set search_path = public as $$
declare secret_id uuid; job_id bigint;
begin
  if length(p_secret) < 24 then raise exception 'Secreto de cron insuficiente'; end if;
  select id into secret_id from vault.secrets where name = 'blog_generation_cron_secret';
  if secret_id is null then perform vault.create_secret(p_secret, 'blog_generation_cron_secret');
  else perform vault.update_secret(secret_id, p_secret); end if;
  select cron.schedule('blog-generation-pulse', '* * * * *', $command$
    select net.http_post(
      url := 'https://www.aipetfriendly.ar/api/cron/generate-blog-post',
      headers := jsonb_build_object('Content-Type','application/json','Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'blog_generation_cron_secret')),
      body := '{"origin":"pg_cron"}'::jsonb, timeout_milliseconds := 55000)
    from public.blog_generation_state state
    left join public.blog_generation_runs run on run.id = state.active_run_id
    where state.singleton and (
      (state.active_run_id is null and state.next_eligible_at <= now()) or
      (state.active_run_id is not null and (run.lease_until is null or run.lease_until < now()) and run.retry_at <= now()));
  $command$) into job_id;
  return job_id;
end;
$$;

create function public.blog_generation_schedule_status()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('state', (select to_jsonb(state) from public.blog_generation_state state where singleton),
    'job', (select jsonb_build_object('jobid',jobid,'schedule',schedule,'active',active) from cron.job where jobname = 'blog-generation-pulse'),
    'last_ticks', (select coalesce(jsonb_agg(tick), '[]'::jsonb) from
      (select status, start_time, end_time from cron.job_run_details where jobid =
        (select jobid from cron.job where jobname = 'blog-generation-pulse') order by start_time desc limit 5) tick),
    'latest_run', (select to_jsonb(run) - 'lease_token' from public.blog_generation_runs run order by created_at desc limit 1));
$$;

revoke all on function public.claim_blog_generation(text), public.save_blog_generation_stage(uuid,uuid,text,jsonb,text),
  public.finish_blog_generation(uuid,uuid), public.configure_blog_generation_schedule(text), public.blog_generation_schedule_status()
  from public, anon, authenticated;
grant execute on function public.claim_blog_generation(text), public.save_blog_generation_stage(uuid,uuid,text,jsonb,text),
  public.finish_blog_generation(uuid,uuid), public.configure_blog_generation_schedule(text), public.blog_generation_schedule_status() to service_role;
revoke all on function public.admin_list_blog_generation_runs() from public, anon;
grant execute on function public.admin_list_blog_generation_runs() to authenticated;

commit;