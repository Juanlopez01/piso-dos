-- Acortador de links (para compartir postulaciones de Talent en RRSS sin URLs largas).
-- Guarda un código corto -> ruta destino (relativa, sin dominio). La ruta /l/[codigo]
-- resuelve el código y redirige.
create table if not exists short_links (
    codigo text primary key,
    destino text not null,           -- path relativo, ej: /talent/busqueda/mi-slug
    clicks int not null default 0,
    created_at timestamptz not null default now()
);

-- Para reusar el mismo código si ya se acortó ese destino.
create index if not exists short_links_destino_idx on short_links (destino);
