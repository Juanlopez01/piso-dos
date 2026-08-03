-- El admin ahora puede agregar a una búsqueda talentos ya existentes (de la
-- vitrina o de postulaciones generales), que no tienen email. Se permite null.
alter table talent_busqueda_postulaciones alter column email drop not null;
