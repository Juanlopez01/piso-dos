'use server'

import { createClient } from '@supabase/supabase-js'

export async function createNewUser(prevState: any, formData: FormData) {
    const nombre = formData.get('nombre') as string
    const email = formData.get('email') as string
    const dni = formData.get('dni') as string // Se usará como contraseña

    if (!nombre || !email || !dni) {
        return { success: false, message: 'Faltan datos obligatorios.' }
    }

    // 1. Iniciamos el cliente Admin (Llave secreta)
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )

    // 2. Crear el usuario en Auth (Sistema de Login)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: dni, // La contraseña es el DNI
        email_confirm: true, // Lo confirmamos automáticamente para que pueda entrar ya
        user_metadata: { full_name: nombre }
    })

    if (authError) {
        return { success: false, message: 'Error al crear usuario: ' + authError.message }
    }

    if (!authData.user) {
        return { success: false, message: 'No se pudo crear el usuario.' }
    }

    // 3. Asegurar que el perfil en la tabla 'profiles' tenga el nombre correcto
    // (A veces el trigger tarda o solo copia el email, así que forzamos la actualización)
    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
            nombre_completo: nombre,
            rol: 'alumno' // Por defecto
        })
        .eq('id', authData.user.id)

    if (profileError) {
        // Si falla esto, el usuario existe pero quizás sin nombre en la tabla pública
        console.error('Error actualizando perfil:', profileError)
    }

    return { success: true, message: 'Usuario creado exitosamente.' }
}