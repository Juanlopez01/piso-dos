-- La Liga 2027: las notas de examen pasan de A/B/C a numéricas (0 a 10).
-- El promedio numérico define la categoría: A >= 8, B 6 a 7.99, C < 6.

-- Nota numérica por examen (reemplaza el puntaje A/B/C, que queda de legado).
alter table liga27_alumno_examen add column if not exists nota numeric(4,2);
-- El puntaje viejo ya no se carga: lo dejamos nullable para no romper inserts.
alter table liga27_alumno_examen alter column puntaje drop not null;

-- Promedio numérico del alumno (0 a 10), además de la letra que ya se guarda.
alter table liga27_inscripciones add column if not exists promedio_num numeric(4,2);
