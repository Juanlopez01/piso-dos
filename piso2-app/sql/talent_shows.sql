-- Sección SHOWS de Piso 2 Talent: obras/producciones con un video resumen y
-- una breve descripción. Se cargan desde el panel admin y se ven en la web.
create table if not exists talent_shows (
    id uuid primary key default gen_random_uuid(),
    titulo text not null,
    descripcion text,
    video_url text,
    portada_url text,
    orden int not null default 0,
    activo boolean not null default true,
    created_at timestamptz not null default now()
);
