-- ============================================================================
-- FIX: la tabla profiles tiene un CHECK 'roles_permitidos' (aparte del enum)
-- que no dejaba asignar el rol 'vendedor'. Lo recreamos con todos los roles.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

alter table public.profiles drop constraint if exists roles_permitidos;

alter table public.profiles add constraint roles_permitidos
    check (rol in (
        'admin', 'recepcion', 'profesor', 'alumno',
        'coordinador', 'auxiliar', 'visitante', 'vendedor'
    ));
