-- ============================================================================
-- Respuestas rápidas (plantillas) para el panel de Consultas.
-- Reusan la tabla asistente_conocimiento con un tipo nuevo: 'respuesta'.
-- tipo = 'respuesta' → texto listo para enviar al contacto de un clic.
-- ============================================================================

alter table asistente_conocimiento drop constraint if exists asistente_conocimiento_tipo_check;
alter table asistente_conocimiento
  add constraint asistente_conocimiento_tipo_check check (tipo in ('info', 'no_responder', 'respuesta'));
