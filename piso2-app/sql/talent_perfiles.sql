-- ============================================================================
-- PISO2 TALENT — Perfil de talento + firma del acuerdo (Latino).
-- Para postularse a una búsqueda, el talento debe primero crear su PERFIL:
-- 3 fotos (cuerpo entero / primer plano / plano americano), 3 videos (Drive o
-- subidos, NO YouTube) y el ACUERDO firmado digitalmente (según sea residente
-- en Argentina o no). Sin el acuerdo firmado no puede postularse.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

create table if not exists public.talent_perfiles (
    id            uuid primary key default gen_random_uuid(),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    email         text not null unique,
    nombre        text not null,
    dni           text,
    telefono      text,
    disciplina    text,
    sexo          text check (sexo is null or sexo in ('mujeres', 'varones')),
    edad          integer,
    altura        integer,
    nacionalidad  text,
    reside_argentina boolean,
    direccion     text,
    descripcion   text,
    -- Fotos requeridas por tipo
    foto_cuerpo_entero   text,
    foto_primer_plano    text,
    foto_plano_americano text,
    fotos_extra   text[] not null default '{}',
    -- Videos (Drive o subidos; nunca YouTube)
    videos        text[] not null default '{}',
    -- Acuerdo / firma digital
    acuerdo_version    text check (acuerdo_version is null or acuerdo_version in ('residente', 'no_residente')),
    acuerdo_aceptado   boolean not null default false,
    firma_url          text,                     -- imagen PNG de la firma dibujada
    firma_aclaracion   text,                     -- nombre en claro
    firma_dni          text,
    representante_nombre text,                   -- solo si el firmante es menor
    representante_dni    text,
    firma_fecha        timestamptz,
    firma_ubicacion    text,
    firma_ip           text,
    completo      boolean not null default false
);
create index if not exists idx_talent_perfiles_email on public.talent_perfiles(email);
alter table public.talent_perfiles enable row level security;

-- Vincular las postulaciones de búsqueda al perfil que las originó.
alter table public.talent_busqueda_postulaciones
    add column if not exists perfil_id uuid references public.talent_perfiles(id) on delete set null;

-- Uploads anónimos en la subcarpeta perfiles/ del bucket talent (fotos + firma).
do $$
begin
    if not exists (select 1 from pg_policies where policyname = 'talent_upload_perfiles_anon') then
        create policy "talent_upload_perfiles_anon" on storage.objects
            for insert to anon with check (
                bucket_id = 'talent' and (storage.foldername(name))[1] = 'perfiles'
            );
    end if;
end $$;
