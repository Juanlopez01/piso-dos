-- ============================================================================
-- PISO2E · Entradas ocultas (promos) + Listas de invitados + Ciclos/búsquedas.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

-- 1) ENTRADAS OCULTAS (2x1 / promos): tipos de entrada que no se muestran en la
--    venta pública salvo que se abra el link con su código de promo.
alter table public.evento_entradas
    add column if not exists oculta       boolean not null default false,
    add column if not exists codigo_promo text;

-- 2) LISTAS DE INVITADOS: cupos sin cargo por función.
create table if not exists public.evento_invitados (
    id          uuid primary key default gen_random_uuid(),
    evento_id   uuid not null references public.eventos(id) on delete cascade,
    nombre      text not null,
    contacto    text,
    cantidad    integer not null default 1,
    notas       text,
    presente    boolean not null default false,
    created_at  timestamptz not null default now(),
    created_by  uuid
);
create index if not exists idx_evento_invitados_evento on public.evento_invitados(evento_id);

-- 3) CICLOS / BÚSQUEDAS de la convocatoria: convocatorias puntuales con su link.
create table if not exists public.convocatorias (
    id            uuid primary key default gen_random_uuid(),
    titulo        text not null,
    descripcion   text,
    slug          text unique not null,
    activa        boolean not null default true,
    fecha_limite  date,
    created_at    timestamptz not null default now(),
    created_by    uuid
);

alter table public.obra_propuestas
    add column if not exists convocatoria_id uuid references public.convocatorias(id) on delete set null;
