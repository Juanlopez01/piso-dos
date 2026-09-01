-- ============================================================================
-- PISO2E · Fase 2 — Ficha técnica de la obra ("perfil vivo").
-- Guarda todas las necesidades técnicas (sonido, luces, proyecciones, armado,
-- datos de función, acuerdo de sala) como un JSON editable en el evento.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.eventos
    add column if not exists ficha_tecnica jsonb;
