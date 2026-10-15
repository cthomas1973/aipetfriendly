-- 060_debug_signature_check.sql
--
-- PASO 19.3.14: migracion diagnostica, sin DDL, que no modifica ningun
-- objeto. Unico proposito: leer el texto exacto que devuelve
-- pg_get_function_identity_arguments para admin_update_blog_post, porque la
-- guarda de 059 aborto por no coincidir con el string esperado
-- ('uuid, text, text, text, text, text, uuid') y no hay forma de ejecutar
-- SQL ad-hoc contra este proyecto sin pasar por una migracion (no hay
-- Docker/psql/pg_dump disponibles en este entorno).
do $$
declare
  v_sig record;
begin
  for v_sig in
    select p.oid, pg_get_function_identity_arguments(p.oid) as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_update_blog_post'
  loop
    raise notice 'ADMIN_UPDATE_BLOG_POST_SIGNATURE: [%] oid=%', v_sig.sig, v_sig.oid;
  end loop;
end;
$$;
