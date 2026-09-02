-- ============================================================================
-- PISO2E · Reembolsos / devoluciones + cancelación de función.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

-- Marca de reembolso en la venta (además del estado 'anulada' que libera cupo).
alter table public.evento_ventas
    add column if not exists reembolsada  boolean not null default false,
    add column if not exists reembolso_at timestamptz,
    add column if not exists reembolso_ref text;   -- id del refund de MP, o 'manual'

-- Cancelación de la función entera.
alter table public.eventos
    add column if not exists cancelado    boolean not null default false,
    add column if not exists cancelado_at timestamptz;
