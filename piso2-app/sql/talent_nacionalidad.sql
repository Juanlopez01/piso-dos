-- Nacionalidad en perfiles de postulantes y talentos.
-- Requisito pedido por seleccionadores (nombre, altura, nacionalidad, edad).

alter table talent_busqueda_postulaciones add column if not exists nacionalidad text;
alter table talent_postulaciones          add column if not exists nacionalidad text;
alter table talentos                      add column if not exists nacionalidad text;
