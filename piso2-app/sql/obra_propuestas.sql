-- ============================================================================
-- PISO2E · Fase 1 — Convocatoria de obras + curaduría.
-- Una compañía/director propone su obra (form público). El equipo cura:
-- ACEPTA (se crea la función/evento vinculado) o RECHAZA (queda en "no aprobadas",
-- visible solo para admin, para ofrecerle alquiler).
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
create table if not exists public.obra_propuestas (
    id             uuid primary key default gen_random_uuid(),
    created_at     timestamptz not null default now(),
    -- Datos que carga el postulante
    titulo         text not null,
    director       text,
    compania       text,
    tipo_obra      text,        -- danza / teatro / musica / mixta / artes vivas / muestra
    participantes  integer,     -- cantidad de participantes / elenco
    duracion_min   integer,
    descripcion    text,
    instagram      text,
    email          text,
    telefono       text,
    videos         text[] not null default '{}',
    imagenes       text[] not null default '{}',
    -- Curaduría
    estado         text not null default 'pendiente'
                   check (estado in ('pendiente', 'aceptada', 'rechazada')),
    nota_curaduria text,
    curada_at      timestamptz,
    curada_por     uuid references profiles(id),
    evento_id      uuid references eventos(id) on delete set null  -- al aceptar, la función creada
);
create index if not exists idx_obra_propuestas_estado on public.obra_propuestas (estado, created_at desc);
alter table public.obra_propuestas enable row level security;

-- Upload anónimo de imágenes/videos de la obra al bucket talent, subcarpeta obras/.
do $$
begin
    if not exists (select 1 from pg_policies where policyname = 'talent_upload_obras_anon') then
        create policy "talent_upload_obras_anon" on storage.objects
            for insert to anon with check (
                bucket_id = 'talent' and (storage.foldername(name))[1] = 'obras'
            );
    end if;
end $$;
