-- ============================================================================
-- FIX: la tabla profiles tiene un CHECK 'roles_permitidos' (aparte del enum)
-- que no dejaba asignar el rol 'vendedor'.
--
-- Como 'rol' YA es un enum (rol_usuario) que restringe los valores válidos,
-- ese CHECK es redundante. Lo borramos y listo (no hay que recrearlo).
-- 'vendedor' ya fue agregado al enum en la migración ventas_externas.sql.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

alter table public.profiles drop constraint if exists roles_permitidos;
