-- ============================================================================
-- PISO2 TALENT — Vitrina de artistas/obras curados por Piso 2
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================

-- 1. TALENTOS (personas y obras/compañías)
create table if not exists public.talentos (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),
    nombre      text not null,
    categoria   text not null check (categoria in ('mujeres', 'varones', 'obras')),
    disciplina  text,                 -- "Bailarina contemporánea", "Obra escénica", etc.
    bio         text,
    fotos       text[] not null default '{}',   -- URLs; la primera es la portada
    video_url   text,                 -- link de YouTube/Vimeo (embed)
    destacado   boolean not null default false,
    activo      boolean not null default true,  -- se desactiva si está contratado
    orden       int not null default 0
);

create index if not exists idx_talentos_categoria on public.talentos(categoria);
create index if not exists idx_talentos_activo on public.talentos(activo);

-- 2. SOLICITUDES de contratación (llegan a Piso 2)
create table if not exists public.talent_solicitudes (
    id               uuid primary key default gen_random_uuid(),
    created_at       timestamptz not null default now(),
    talento_id       uuid references public.talentos(id) on delete set null,
    talento_nombre   text,
    cliente_nombre   text not null,
    cliente_contacto text not null,   -- email o teléfono
    cliente_empresa  text,
    mensaje          text,
    atendido         boolean not null default false
);

-- 3. RLS: bloqueamos acceso directo del cliente. Todo pasa por server actions
--    con service role (la vitrina pública lee vía action con admin).
alter table public.talentos enable row level security;
alter table public.talent_solicitudes enable row level security;

-- 4. BUCKET de fotos (público)
insert into storage.buckets (id, name, public)
values ('talent', 'talent', true)
on conflict (id) do nothing;

do $$
begin
    if not exists (select 1 from pg_policies where policyname = 'talent_read_public') then
        create policy "talent_read_public" on storage.objects
            for select using (bucket_id = 'talent');
    end if;
    if not exists (select 1 from pg_policies where policyname = 'talent_upload_auth') then
        create policy "talent_upload_auth" on storage.objects
            for insert to authenticated with check (bucket_id = 'talent');
    end if;
    if not exists (select 1 from pg_policies where policyname = 'talent_delete_auth') then
        create policy "talent_delete_auth" on storage.objects
            for delete to authenticated using (bucket_id = 'talent');
    end if;
end $$;

-- 5. DATOS DE EJEMPLO (para ver la vitrina antes de cargar los reales; borrar luego)
insert into public.talentos (nombre, categoria, disciplina, bio, fotos, destacado, orden) values
('Valentina Ríos', 'mujeres', 'Bailarina Contemporánea', 'Intérprete y performer con base en Buenos Aires. Formación en danza contemporánea y teatro físico.', array['https://picsum.photos/seed/val1/800/1100','https://picsum.photos/seed/val2/800/1100','https://picsum.photos/seed/val3/800/1100'], true, 1),
('Camila Ferrer', 'mujeres', 'Heels / Comercial', 'Bailarina comercial, campañas de moda y videoclips.', array['https://picsum.photos/seed/cam1/800/1100','https://picsum.photos/seed/cam2/800/1100'], false, 2),
('Tomás Aguirre', 'varones', 'Urbano / Hip Hop', 'Bailarín y coreógrafo urbano. Shows en vivo y producciones audiovisuales.', array['https://picsum.photos/seed/tom1/800/1100','https://picsum.photos/seed/tom2/800/1100'], true, 1),
('Lucas Peralta', 'varones', 'Contemporáneo', 'Intérprete de compañía, gira internacional.', array['https://picsum.photos/seed/luc1/800/1100'], false, 2),
('ECOS', 'obras', 'Obra escénica para exportar', 'Pieza de danza-teatro de 45 min. Elenco de 6 intérpretes. Disponible para gira.', array['https://picsum.photos/seed/obra1/1200/800','https://picsum.photos/seed/obra2/1200/800'], true, 1),
('RAÍZ', 'obras', 'Compañía / Espectáculo', 'Espectáculo de danza folklórica contemporánea.', array['https://picsum.photos/seed/obra3/1200/800'], false, 2)
on conflict do nothing;
