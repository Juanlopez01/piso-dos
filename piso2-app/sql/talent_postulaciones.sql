-- ============================================================================
-- PISO2 TALENT — Postulaciones: gente logueada que quiere SER talento.
-- (Distinto de talent_solicitudes, que son pedidos de contratación de marcas.)
-- El admin las revisa y puede: Aceptar (pasa a talentos) / Stand by / Eliminar.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

create table if not exists public.talent_postulaciones (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),
    user_id     uuid references public.profiles(id),  -- quién se postuló (logueado)
    nombre      text not null,
    rubro       text,                 -- disciplina: Bailarín/a, Modelo, etc.
    descripcion text,
    edad        int,
    altura      int,                  -- en cm
    sexo        text,                 -- 'mujeres' | 'varones' (mapea a categoria del talento)
    foto_url    text,
    video_url   text,
    estado      text not null default 'pendiente'
                check (estado in ('pendiente', 'standby'))
);

create index if not exists idx_talent_post_estado on public.talent_postulaciones(estado);

alter table public.talent_postulaciones enable row level security;

-- Datos extra que la postulación aporta y que conviene conservar al aceptar.
alter table public.talentos
    add column if not exists edad int,
    add column if not exists altura int;
