-- ============================================================================
-- PISO2 TALENT — El acuerdo de los perfiles con cuenta es el ÚNICO de inscripción
-- (acuerdo_version = 'inscripcion'). El CHECK original solo permitía
-- 'residente'/'no_residente' (del flujo de búsquedas) → la firma del perfil
-- fallaba. Ampliamos el CHECK para aceptar también 'inscripcion'.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.talent_perfiles drop constraint if exists talent_perfiles_acuerdo_version_check;
alter table public.talent_perfiles add constraint talent_perfiles_acuerdo_version_check
    check (acuerdo_version is null or acuerdo_version in ('residente', 'no_residente', 'inscripcion'));
