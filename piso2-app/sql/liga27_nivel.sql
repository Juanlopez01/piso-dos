-- La Liga 2027: nivel del inscripto (Liga 1 o 2). Nullable = sin asignar.
alter table liga27_inscripciones add column if not exists nivel smallint;
