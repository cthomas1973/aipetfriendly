begin;

create or replace function public.list_blog_posts(p_limit integer default 20, p_offset integer default 0)
returns setof public.blog_posts
language sql
security definer
set search_path = public
stable
as $$
  select * from public.blog_posts
  where status = 'published'
    and slug not in (
      'primeros-auxilios-para-perros-y-gatos-que-hacer-si-se-atragantan',
      'salud-preventiva-en-mascotas-vacunacion-y-desparasitacion',
      'cuidado-de-mascotas-segun-la-edad-claves-para-cada-etapa-de-su-vida'
    )
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.get_blog_post_by_slug(p_slug text)
returns public.blog_posts
language sql
security definer
set search_path = public
stable
as $$
  select * from public.blog_posts
  where slug = p_slug
    and status = 'published'
    and slug not in (
      'primeros-auxilios-para-perros-y-gatos-que-hacer-si-se-atragantan',
      'salud-preventiva-en-mascotas-vacunacion-y-desparasitacion',
      'cuidado-de-mascotas-segun-la-edad-claves-para-cada-etapa-de-su-vida'
    )
  limit 1;
$$;

commit;