-- ============================================================================
-- PISO2E · Flyer para los ciclos / búsquedas de la convocatoria.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.convocatorias
    add column if not exists flyer_url text;
