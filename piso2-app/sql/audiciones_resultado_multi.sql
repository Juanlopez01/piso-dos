-- ============================================================================
-- Piso 2 On Tour — el "resultado" del participante ahora admite VARIAS marcas a
-- la vez (ej. "media_beca_liga,talents"): una persona puede tener beca y además
-- quedar para casting. Se guardan separadas por coma en la misma columna, así que
-- sacamos el CHECK de valor único (los valores los controla la app).
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.audicion_participantes drop constraint if exists audicion_participantes_resultado_check;
