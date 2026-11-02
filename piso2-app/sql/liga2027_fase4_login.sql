-- ============================================================================
-- LA LIGA 2027 — FASE 4 (Integración al login de 2M)
-- Los alumnos de La Liga 2027 dejan de tener cuenta propia: son alumnos normales
-- de Supabase (profiles, rol 'alumno') y entran por /login como todos.
-- La inscripción se liga al profiles.id del alumno (profile_id).
--
-- liga27_perfiles queda SOLO como datos de contacto de la postulación (lead);
-- ya no es una cuenta. Idempotente.
-- ============================================================================

-- La inscripción ahora cuelga del alumno de 2M (auth user / profiles).
alter table public.liga27_inscripciones
    add column if not exists profile_id uuid references public.profiles(id) on delete set null;
create index if not exists idx_liga27_insc_profile on public.liga27_inscripciones(profile_id);

-- perfil_id (cuenta propia vieja) deja de ser obligatorio: las nuevas
-- inscripciones usan profile_id.
alter table public.liga27_inscripciones alter column perfil_id drop not null;

-- La postulación es un lead: no necesita cuenta propia asociada.
alter table public.liga27_postulaciones alter column perfil_id drop not null;
