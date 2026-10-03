-- ============================================================================
-- Métricas por recepcionista — autoría de 3 acciones que hoy no se atribuían:
--   1) Clases cargadas  -> clases.creado_por
--   2) Newsletters       -> notificaciones.creado_por (la notificación "madre")
--   3) Revisiones de cuponeras vencidas -> tabla nueva cuponera_revisiones
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

alter table public.clases add column if not exists creado_por uuid references public.profiles(id);
alter table public.notificaciones add column if not exists creado_por uuid references public.profiles(id);

create table if not exists public.cuponera_revisiones (
    id uuid primary key default gen_random_uuid(),
    alumno_id uuid references public.profiles(id),
    pack_id uuid,
    revisado_por uuid references public.profiles(id),
    created_at timestamptz not null default now()
);

create index if not exists idx_cuponera_revisiones_por on public.cuponera_revisiones (revisado_por, created_at);
create index if not exists idx_clases_creado_por on public.clases (creado_por, created_at);
create index if not exists idx_notificaciones_creado_por on public.notificaciones (creado_por, created_at);
