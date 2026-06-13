-- ============================================================================
-- MATERIAL DE ESTUDIO (PDFs) para Grupos (compañías) y La Liga (por nivel)
-- Correr una sola vez en el SQL Editor de Supabase.
-- ============================================================================

-- 1. TABLA
create table if not exists public.materiales (
    id           uuid primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),
    titulo       text not null,
    descripcion  text,
    archivo_url  text not null,
    subido_por   uuid references public.profiles(id) on delete set null,
    -- Ámbito: pertenece a un grupo O a un nivel de liga (uno de los dos)
    compania_id  uuid references public.companias(id) on delete cascade,
    liga_nivel   int
);

create index if not exists idx_materiales_compania on public.materiales(compania_id);
create index if not exists idx_materiales_liga_nivel on public.materiales(liga_nivel);

-- 2. RLS: bloqueamos acceso directo del cliente.
--    Todo pasa por server actions con service role (igual que companias_planes).
alter table public.materiales enable row level security;

-- 3. BUCKET de Storage (público, como apto_fisico)
insert into storage.buckets (id, name, public)
values ('materiales', 'materiales', true)
on conflict (id) do nothing;

-- 4. POLÍTICAS de Storage para el bucket 'materiales'
--    (la subida real la hace el usuario logueado desde el cliente; el control
--     fino de "quién puede" está en la server action que crea la fila)
do $$
begin
    if not exists (select 1 from pg_policies where policyname = 'materiales_read_public') then
        create policy "materiales_read_public" on storage.objects
            for select using (bucket_id = 'materiales');
    end if;
    if not exists (select 1 from pg_policies where policyname = 'materiales_upload_auth') then
        create policy "materiales_upload_auth" on storage.objects
            for insert to authenticated with check (bucket_id = 'materiales');
    end if;
    if not exists (select 1 from pg_policies where policyname = 'materiales_delete_auth') then
        create policy "materiales_delete_auth" on storage.objects
            for delete to authenticated using (bucket_id = 'materiales');
    end if;
end $$;
