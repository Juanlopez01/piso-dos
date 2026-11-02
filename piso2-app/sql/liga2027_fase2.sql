-- ============================================================================
-- LA LIGA 2027 — FASE 2 (Seguimiento académico)
-- Evaluaciones A/B/C + devoluciones, asistencias + régimen de regularidad (libres
-- del mes / del bloque, detectados solos), programa por bloques y portal docente.
--
-- Depende de la Fase 1 (liga27_inscripciones). Todo el acceso pasa por server
-- actions con service role → RLS activado sin policy. Idempotente.
-- ============================================================================

-- ── 2.1 Disciplinas + exámenes + notas ───────────────────────────────────────
create table if not exists public.liga27_disciplinas (
    id          uuid primary key default gen_random_uuid(),
    nombre      text not null,
    anio        int not null default 2027,
    bloque      int not null default 1,                 -- 1 o 2 (= cuatrimestre)
    docente_id  uuid references public.profiles(id) on delete set null,
    orden       int not null default 0,
    activa      boolean not null default true,
    creado_at   timestamptz not null default now()
);
create index if not exists idx_liga27_disc_docente on public.liga27_disciplinas(docente_id);
alter table public.liga27_disciplinas enable row level security;

create table if not exists public.liga27_examenes (
    id            uuid primary key default gen_random_uuid(),
    disciplina_id uuid not null references public.liga27_disciplinas(id) on delete cascade,
    numero        int not null check (numero in (1, 2)),
    fecha         date,
    libera_bloque boolean not null default false,       -- aprobar este examen libera el bloque 2
    creado_at     timestamptz not null default now(),
    unique (disciplina_id, numero)
);
alter table public.liga27_examenes enable row level security;

create table if not exists public.liga27_alumno_examen (
    id             uuid primary key default gen_random_uuid(),
    inscripcion_id uuid not null references public.liga27_inscripciones(id) on delete cascade,
    examen_id      uuid not null references public.liga27_examenes(id) on delete cascade,
    puntaje        text check (puntaje in ('A', 'B', 'C')),
    observaciones  text,
    cargado_por    uuid references public.profiles(id) on delete set null,
    actualizado_at timestamptz not null default now(),
    unique (inscripcion_id, examen_id)
);
create index if not exists idx_liga27_ae_insc on public.liga27_alumno_examen(inscripcion_id);
alter table public.liga27_alumno_examen enable row level security;

-- ── 2.2 Asistencias + régimen de regularidad ─────────────────────────────────
create table if not exists public.liga27_asistencia (
    id             uuid primary key default gen_random_uuid(),
    inscripcion_id uuid not null references public.liga27_inscripciones(id) on delete cascade,
    disciplina_id  uuid not null references public.liga27_disciplinas(id) on delete cascade,
    clase_fecha    date not null,
    presente       boolean not null default false,
    justificada    boolean not null default false,      -- falta justificada = no cuenta para libre
    nota           text,
    modificada_por uuid references public.profiles(id) on delete set null,
    modificada_at  timestamptz not null default now(),
    unique (inscripcion_id, disciplina_id, clase_fecha)
);
create index if not exists idx_liga27_asis_insc on public.liga27_asistencia(inscripcion_id);
create index if not exists idx_liga27_asis_disc on public.liga27_asistencia(disciplina_id, clase_fecha);
alter table public.liga27_asistencia enable row level security;

-- Eventos de "libre" detectados automáticamente (mes = disciplina+mes; bloque =
-- disciplina+bloque). Son DISTINTOS: libre del mes ≠ libre del bloque.
create table if not exists public.liga27_libres (
    id             uuid primary key default gen_random_uuid(),
    inscripcion_id uuid not null references public.liga27_inscripciones(id) on delete cascade,
    disciplina_id  uuid not null references public.liga27_disciplinas(id) on delete cascade,
    tipo           text not null check (tipo in ('mes', 'bloque')),
    mes            int,
    anio           int,
    bloque         int,
    faltas         int not null default 0,
    motivo         text,
    resuelto       boolean not null default false,      -- bloque: resuelto al rendir libre + repagar matrícula
    creado_at      timestamptz not null default now(),
    unique (inscripcion_id, disciplina_id, tipo, mes, anio, bloque)
);
create index if not exists idx_liga27_libres_insc on public.liga27_libres(inscripcion_id);
alter table public.liga27_libres enable row level security;

-- Historial de correcciones/justificaciones de asistencia (auditoría).
create table if not exists public.liga27_asistencia_historial (
    id             uuid primary key default gen_random_uuid(),
    inscripcion_id uuid references public.liga27_inscripciones(id) on delete set null,
    disciplina_id  uuid references public.liga27_disciplinas(id) on delete set null,
    clase_fecha    date,
    accion         text not null,                        -- 'tomar' | 'corregir' | 'justificar'
    detalle        text,
    autor_id       uuid references public.profiles(id) on delete set null,
    creado_at      timestamptz not null default now()
);
alter table public.liga27_asistencia_historial enable row level security;

-- ── 2.3 Programa + portal docente (contenido por clase) ──────────────────────
create table if not exists public.liga27_programa (
    id            uuid primary key default gen_random_uuid(),
    disciplina_id uuid references public.liga27_disciplinas(id) on delete cascade,
    bloque        int not null default 1,
    titulo        text,
    contenido     text,
    bloqueado     boolean not null default false,        -- bloque 2 arranca bloqueado (gris)
    orden         int not null default 0
);
alter table public.liga27_programa enable row level security;

create table if not exists public.liga27_clases_contenido (
    id                uuid primary key default gen_random_uuid(),
    disciplina_id     uuid not null references public.liga27_disciplinas(id) on delete cascade,
    clase_fecha       date not null,
    contenido         text,
    metodo_evaluacion text,
    reemplazo_nombre  text,
    reemplazo_contacto text,
    cargado_por       uuid references public.profiles(id) on delete set null,
    creado_at         timestamptz not null default now(),
    unique (disciplina_id, clase_fecha)
);
alter table public.liga27_clases_contenido enable row level security;
