-- ============================================================================
-- PISO2E · "Acceso de la compañía": un link propio por función (evento) para
-- que el elenco vea SUS ventas en tiempo real, sin acceso al resto del sistema.
-- Solo agrega un token por evento (el link es /compania/<eventoId>?t=<token>).
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.eventos
    add column if not exists token_compania text;
