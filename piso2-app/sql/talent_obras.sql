-- Sección OBRAS de Piso 2 Talent: castings de obras/producciones con flyer o
-- video y requisitos, a los que la gente se postula (aparte de las Búsquedas).
create table if not exists talent_obras (
    id uuid primary key default gen_random_uuid(),
    titulo text not null,
    descripcion text,
    requisitos text,
    ubicacion text,
    flyer_url text,
    video_url text,
    fecha_limite date,
    slug text unique,
    activa boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists talent_obra_postulaciones (
    id uuid primary key default gen_random_uuid(),
    obra_id uuid references talent_obras(id) on delete cascade,
    nombre text not null,
    email text,
    telefono text,
    rubro text,
    descripcion text,
    edad int,
    altura int,
    nacionalidad text,
    sexo text,
    fotos text[] default '{}',
    videos text[] default '{}',
    estado text not null default 'pendiente',
    created_at timestamptz not null default now()
);
