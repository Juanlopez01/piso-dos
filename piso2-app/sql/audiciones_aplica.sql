-- ============================================================================
-- Piso 2 On Tour — a qué aplica el participante:
--   'la_liga'  = Beca / Formación (La Liga)
--   'casting'  = Casting latino (Talents)
--   'ambas'    = Las dos (un solo formulario, entra en las dos "carpetas")
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.audicion_participantes add column if not exists aplica_a text not null default 'ambas';

alter table public.audicion_participantes drop constraint if exists audicion_participantes_aplica_a_check;
alter table public.audicion_participantes add constraint audicion_participantes_aplica_a_check
    check (aplica_a in ('la_liga', 'casting', 'ambas'));
