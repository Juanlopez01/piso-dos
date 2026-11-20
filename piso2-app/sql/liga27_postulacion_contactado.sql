-- La Liga 2027: marcar si a un postulante ya se le escribió/contactó (tick en Postulaciones).
alter table liga27_postulaciones add column if not exists contactado boolean not null default false;
alter table liga27_postulaciones add column if not exists contactado_at timestamptz;
