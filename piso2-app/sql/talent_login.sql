-- ============================================================================
-- PISO2 TALENT — Perfiles con CUENTA (usuario y contraseña).
-- El talento ahora se registra con email + contraseña y puede volver a entrar
-- para editar sus fotos y datos cuando se lo pidamos. El login es propio de
-- Talent (NO es la cuenta de alumno): email único + hash de contraseña.
-- También sumamos los campos nuevos del perfil (apellido, fecha de nacimiento,
-- instagram, peso, idiomas, talles, foto artística, talentos múltiples) y el
-- gate de vitrina (aceptado) + el contrato adjunto firmado.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================================
alter table public.talent_perfiles
    -- Cuenta (login propio de Talent)
    add column if not exists password_hash   text,
    -- Datos nuevos del perfil
    add column if not exists apellido         text,            -- interno (la vitrina muestra solo el nombre)
    add column if not exists fecha_nacimiento date,            -- de acá se calcula la edad
    add column if not exists instagram        text,
    add column if not exists peso             integer,
    add column if not exists idiomas          text,
    add column if not exists talle_remera     text,            -- XS / S / M / L
    add column if not exists talle_pantalon   text,            -- XS / S / M / L
    add column if not exists talle_calzado    text,
    add column if not exists foto_artistica   text,            -- 4ta foto (artística)
    add column if not exists talentos         text[] not null default '{}',  -- dancer/acróbata/actor/cantante/músico/modelo
    -- Vitrina + contrato
    add column if not exists aceptado         boolean not null default false, -- lo marca el staff; sin esto no aparece en la vidriera
    add column if not exists contrato_adjunto_url text;        -- contrato firmado subido (alternativa a la firma digital)
