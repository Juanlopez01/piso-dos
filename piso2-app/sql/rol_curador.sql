-- ============================================================================
-- Rol "curador" (Chifle) — entra a Curaduría, ve las postulaciones y elige.
-- Correr una vez en el SQL Editor de Supabase. El enum de rol es rol_usuario.
-- ============================================================================
alter type public.rol_usuario add value if not exists 'curador';
