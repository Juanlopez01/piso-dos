-- La Liga 2027: notas internas de seguimiento del equipo sobre cada inscripto
-- (ej. "le escribí, no respondió"). No las ve el alumno.
create table if not exists liga27_seguimiento (
    id uuid primary key default gen_random_uuid(),
    inscripcion_id uuid not null references liga27_inscripciones(id) on delete cascade,
    texto text not null,
    autor_id uuid references profiles(id),
    created_at timestamptz not null default now()
);
create index if not exists idx_liga27_seguimiento_insc on liga27_seguimiento(inscripcion_id);
