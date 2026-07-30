-- ============================================================================
-- PISO2 TALENT — Búsquedas personalizadas (audiciones / castings).
-- El admin crea búsquedas (ej: "Bailarines para Dubai") y comparte un link
-- público donde los interesados se postulan sin necesidad de cuenta.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

-- 1. BÚSQUEDAS
create table if not exists public.talent_busquedas (
    id            uuid primary key default gen_random_uuid(),
    created_at    timestamptz not null default now(),
    titulo        text not null,
    descripcion   text,
    requisitos    text,
    ubicacion     text,
    categoria     text check (categoria is null or categoria in ('mujeres', 'varones', 'todos')),
    fecha_limite  date,
    activa        boolean not null default true,
    slug          text not null unique
);

create index if not exists idx_talent_busq_slug on public.talent_busquedas(slug);
create index if not exists idx_talent_busq_activa on public.talent_busquedas(activa);

alter table public.talent_busquedas enable row level security;

-- 2. POSTULACIONES A BÚSQUEDAS (no requieren cuenta)
create table if not exists public.talent_busqueda_postulaciones (
    id            uuid primary key default gen_random_uuid(),
    created_at    timestamptz not null default now(),
    busqueda_id   uuid not null references public.talent_busquedas(id) on delete cascade,
    nombre        text not null,
    email         text not null,
    telefono      text,
    rubro         text,
    descripcion   text,
    edad          int,
    altura        int,
    sexo          text check (sexo is null or sexo in ('mujeres', 'varones')),
    fotos         text[] not null default '{}',
    videos        text[] not null default '{}',
    estado        text not null default 'pendiente'
                  check (estado in ('pendiente', 'standby', 'descartado'))
);

create index if not exists idx_talent_busq_post_busqueda on public.talent_busqueda_postulaciones(busqueda_id);
create index if not exists idx_talent_busq_post_estado on public.talent_busqueda_postulaciones(estado);

alter table public.talent_busqueda_postulaciones enable row level security;

-- 3. Permitir uploads anónimos en la subcarpeta busquedas/ del bucket talent.
-- Necesario porque los postulantes a búsquedas no tienen cuenta.
do $$
begin
    if not exists (select 1 from pg_policies where policyname = 'talent_upload_busquedas_anon') then
        create policy "talent_upload_busquedas_anon" on storage.objects
            for insert to anon with check (
                bucket_id = 'talent' and (storage.foldername(name))[1] = 'busquedas'
            );
    end if;
end $$;
