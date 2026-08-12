-- Corrige un bug de la migracion 023_ai_usage_monthly_reset.sql:
-- "alter table ... add column period_key text not null default to_char(now(), 'YYYY-MM')"
-- asigna ese default (el mes en que se corrio la migracion) a TODAS las filas
-- existentes de una sola vez en Postgres. El "update ... where period_key is null"
-- que segia nunca se ejecutaba porque ninguna fila quedaba en null, por lo que el
-- consumo de meses anteriores quedaba marcado incorrectamente como "mes actual"
-- y el contador no se reseteaba al cambiar de mes.
--
-- Este fix recalcula period_key en base al updated_at real de cada fila (mejor
-- aproximacion disponible del mes del ultimo uso real), para que filas sin uso
-- en el mes en curso vuelvan a contar como 0.

update public.ai_pet_usage
set period_key = to_char(updated_at, 'YYYY-MM')
where period_key <> to_char(updated_at, 'YYYY-MM');
