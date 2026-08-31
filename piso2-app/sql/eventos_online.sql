-- ============================================================================
-- PISO2E · Ticketera Fase 2 — venta online con MercadoPago + entradas con QR.
-- Cada evento puede habilitarse para venta online (link público). El comprador
-- paga con MP; al aprobarse el pago se generan las entradas individuales (QR).
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

-- 1. Evento: habilitar venta online
alter table public.eventos
    add column if not exists venta_online boolean not null default false;

-- 2. Ventas: sumar estado 'pendiente' (online sin pagar) + datos de MP + token público
alter table public.evento_ventas drop constraint if exists evento_ventas_estado_check;
alter table public.evento_ventas add constraint evento_ventas_estado_check
    check (estado in ('pendiente', 'confirmada', 'anulada'));

alter table public.evento_ventas
    add column if not exists canal             text not null default 'mostrador',  -- mostrador / online
    add column if not exists mp_preference_id  text,
    add column if not exists mp_payment_id     text,
    add column if not exists token             text;  -- para el link público de las entradas

-- 3. Entradas individuales (una por unidad vendida) con su QR
create table if not exists public.evento_tickets (
    id           uuid primary key default gen_random_uuid(),
    venta_id     uuid not null references public.evento_ventas(id) on delete cascade,
    entrada_id   uuid not null references public.evento_entradas(id),
    codigo       text not null unique,                 -- lo que codifica el QR (para escanear en la puerta)
    usado        boolean not null default false,
    usado_at     timestamptz,
    created_at   timestamptz not null default now()
);
create index if not exists idx_evento_tickets_venta on public.evento_tickets(venta_id);
create index if not exists idx_evento_tickets_codigo on public.evento_tickets(codigo);
alter table public.evento_tickets enable row level security;
