-- ============================================================================
-- ALQUILER DE SALA AUTOMÁTICO (online) — Fase 1
-- Agrega a `alquileres` lo necesario para la reserva por autoservicio con seña:
--   - user_id: el usuario de 2M que reservó online.
--   - sena_monto: monto de la seña (50% del total) a cobrar para guardar la sala.
--   - reservado_hasta: vencimiento del "hold" de 15 min mientras no paga la seña.
--   - mp_ref / origen: referencia de MP y si la reserva nació online o en recepción.
-- Idempotente. No toca las reservas existentes (origen queda 'recepcion').
-- ============================================================================

alter table public.alquileres
    add column if not exists user_id uuid references public.profiles(id) on delete set null,
    add column if not exists sena_monto numeric not null default 0,
    add column if not exists reservado_hasta timestamptz,
    add column if not exists mp_ref text,
    add column if not exists origen text not null default 'recepcion';

create index if not exists idx_alquileres_user on public.alquileres(user_id);
create index if not exists idx_alquileres_sala_fecha on public.alquileres(sala_id, fecha);

-- ── Obras (eventos) en la disponibilidad ────────────────────────────────────
-- Para que una función bloquee la sala correcta al alquilar, la obra necesita
-- SALA y HORA DE FIN. `eventos.fecha` ya es el inicio (timestamptz). Las obras
-- viejas quedan sin sala → no bloquean ninguna (no rompen nada).
alter table public.eventos
    add column if not exists sala_id uuid references public.salas(id) on delete set null,
    add column if not exists fecha_fin timestamptz;

create index if not exists idx_eventos_sala_fecha on public.eventos(sala_id, fecha);
