-- ============================================================================
-- PISO2E · Link de puerta para gente externa.
-- Un token por evento habilita una página sin cuenta para que personal externo
-- lea QR (check-in) y cargue ventas en la puerta.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.eventos
    add column if not exists token_puerta text;
