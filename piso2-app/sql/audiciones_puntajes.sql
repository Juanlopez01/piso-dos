-- ============================================================================
-- Piso 2 On Tour — las aptitudes pasan de tilde (sí/no) a PUNTAJE del 1 al 10.
-- 0 = sin puntuar. Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.audicion_participantes
    alter column manejo_tacos drop default,
    alter column manejo_tacos type smallint using (case when manejo_tacos then 10 else 0 end),
    alter column manejo_tacos set default 0;

alter table public.audicion_participantes
    alter column sabe_jazz_heels drop default,
    alter column sabe_jazz_heels type smallint using (case when sabe_jazz_heels then 10 else 0 end),
    alter column sabe_jazz_heels set default 0;

alter table public.audicion_participantes
    alter column sabe_tecnica drop default,
    alter column sabe_tecnica type smallint using (case when sabe_tecnica then 10 else 0 end),
    alter column sabe_tecnica set default 0;

alter table public.audicion_participantes
    alter column sabe_urbano drop default,
    alter column sabe_urbano type smallint using (case when sabe_urbano then 10 else 0 end),
    alter column sabe_urbano set default 0;
