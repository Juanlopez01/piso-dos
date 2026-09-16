-- ============================================================================
-- PISO2E · Flyer propio por obra (para el "Programa" en la página pública del
-- evento). Si no se carga, se usa la primera foto que subió la obra en la
-- convocatoria. Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.obra_propuestas
    add column if not exists flyer_url text;
