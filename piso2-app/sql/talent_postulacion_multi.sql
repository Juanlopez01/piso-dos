-- ============================================================================
-- Postulaciones de Talent: permitir hasta 3 fotos y hasta 3 links de video.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

alter table public.talent_postulaciones
    add column if not exists fotos  text[] not null default '{}',
    add column if not exists videos text[] not null default '{}';

-- Backfill de las postulaciones existentes (columnas viejas de a una).
update public.talent_postulaciones
set fotos = array[foto_url]
where foto_url is not null and coalesce(array_length(fotos, 1), 0) = 0;

update public.talent_postulaciones
set videos = array[video_url]
where video_url is not null and coalesce(array_length(videos, 1), 0) = 0;

-- El talento publicado ya guarda varias fotos (fotos[]); le sumamos varios videos.
alter table public.talentos
    add column if not exists videos text[] not null default '{}';
