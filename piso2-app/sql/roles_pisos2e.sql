-- ============================================================================
-- PISO2E · Roles nuevos para el circuito de eventos.
--   jefe_sala : programa las funciones y entradas en la ticketera (Wally).
--   tecnica   : carga la ficha técnica de cada obra (Ana, More, Abraham).
--
-- El enum de rol en esta base se llama 'rol_usuario'. Cada ALTER TYPE ... ADD
-- VALUE tiene que correr SUELTO (no dentro de una transacción / bloque). Si el
-- SQL Editor te da error de transacción, corré cada línea por separado.
-- Correr una vez ANTES de asignar estos roles desde Usuarios.
-- ============================================================================
alter type public.rol_usuario add value if not exists 'jefe_sala';
alter type public.rol_usuario add value if not exists 'tecnica';
