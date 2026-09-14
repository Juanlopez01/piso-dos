-- ============================================================================
-- Índices de performance (#9 del paneo).
--
-- Postgres NO indexa automáticamente las foreign keys, así que las columnas
-- por las que más filtramos (clase_id, user_id, turno_id, etc.) hacían scans
-- completos en tablas que ya son grandes. Estos índices aceleran clase detalle,
-- resumen mensual, reporte de caja, tienda y el historial del perfil.
--
-- Todos con IF NOT EXISTS: es seguro correrlo más de una vez. En estas tablas
-- el CREATE INDEX es rápido; si en algún momento crecen mucho y querés evitar
-- el bloqueo de escritura, se puede usar CREATE INDEX CONCURRENTLY (pero ese
-- NO puede correr dentro de una transacción, así que iría de a uno).
-- ============================================================================

-- inscripciones: la tabla más consultada (clase detalle, resumen, auto-inscribir)
create index if not exists idx_inscripciones_clase_id      on inscripciones (clase_id);
create index if not exists idx_inscripciones_user_id       on inscripciones (user_id);
create index if not exists idx_inscripciones_pack_usado_id on inscripciones (pack_usado_id);

-- alumno_packs: historial del perfil, créditos, cupos de tienda
create index if not exists idx_alumno_packs_user_id     on alumno_packs (user_id);
create index if not exists idx_alumno_packs_producto_id on alumno_packs (producto_id);

-- caja_movimientos: cierre de caja, liquidaciones y reporte por rango de fechas
create index if not exists idx_caja_movimientos_turno_id   on caja_movimientos (turno_id);
create index if not exists idx_caja_movimientos_created_at on caja_movimientos (created_at);

-- caja_turnos: buscar el turno abierto del cajero (se hace en cada cobro)
create index if not exists idx_caja_turnos_usuario_estado on caja_turnos (usuario_id, estado);

-- clases: agenda / cartelera / reporte por fecha, y agrupado por serie
create index if not exists idx_clases_inicio   on clases (inicio);
create index if not exists idx_clases_serie_id on clases (serie_id);

-- pagos por alumno (historial del perfil)
create index if not exists idx_pagos_online_user_id     on pagos_online (user_id);
create index if not exists idx_liga_pagos_alumno_id      on liga_pagos (alumno_id);
create index if not exists idx_companias_pagos_alumno_id on companias_pagos (alumno_id);
