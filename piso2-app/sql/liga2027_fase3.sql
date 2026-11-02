-- ============================================================================
-- LA LIGA 2027 — FASE 3 (Beneficios + Coordinación)
-- El rendimiento (letra A/B/C del promedio general) desbloquea beneficios; la
-- coordinación ve todo menos los pagos; alertas automáticas (libres/mora) ya
-- salen de las server actions de la Fase 1/2.
--
-- Depende de las Fases 1 y 2. Todo el acceso pasa por server actions con service
-- role → RLS activado sin policy. Idempotente.
-- ============================================================================

-- ── 3.1 Beneficios por categoría A/B/C ───────────────────────────────────────
-- Una fila por letra. `items` = lista de beneficios (texto, uno por línea en la
-- UI → se guarda como jsonb de strings). La dirección edita esto desde el panel.
create table if not exists public.liga27_beneficios (
    letra          text primary key check (letra in ('A', 'B', 'C')),
    items          jsonb not null default '[]'::jsonb,
    nota           text,
    actualizado_por uuid references public.profiles(id) on delete set null,
    actualizado_at timestamptz not null default now()
);
alter table public.liga27_beneficios enable row level security;

-- Defaults (placeholder — la dirección los reemplaza desde el panel). No piso
-- filas existentes: solo inserta la letra si todavía no está.
insert into public.liga27_beneficios (letra, items, nota) values
    ('A', '["Prioridad en audiciones y castings","Acceso a salas para ensayar","Descuentos y becas","Acceso a oportunidades y actividades extra"]'::jsonb, 'Categoría de mayor rendimiento.'),
    ('B', '["Acceso a salas para ensayar (con reserva)","Descuentos seleccionados","Participación en actividades"]'::jsonb, null),
    ('C', '["Acompañamiento para mejorar tu promedio","Acceso a los contenidos del programa"]'::jsonb, null)
on conflict (letra) do nothing;
