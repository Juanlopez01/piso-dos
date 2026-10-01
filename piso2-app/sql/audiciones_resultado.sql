-- ============================================================================
-- Piso 2 On Tour — el "resultado" del participante ahora es su DESTINO:
-- pendiente, La Liga (con beca / media beca) o Talents (Latin), o descartado.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.audicion_participantes drop constraint if exists audicion_participantes_resultado_check;
alter table public.audicion_participantes add constraint audicion_participantes_resultado_check
    check (resultado in ('pendiente', 'la_liga', 'beca_liga', 'media_beca_liga', 'talents', 'no'));
