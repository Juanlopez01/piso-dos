import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { email, password, nombre, apellido, rol, telefono, dni } = body

        // Usamos el Service Role para saltar el RLS (Poderes de Admin)
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // 1. VERIFICAR SI EL USUARIO YA EXISTE EN LA TABLA PROFILES
        const { data: perfilExistente } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle()

        if (perfilExistente) {
            // ¡EXISTE! Lo devolvemos sin crear nada para que el frontend le asigne el pack.
            return NextResponse.json({ user: { id: perfilExistente.id }, message: 'Usuario ya existía' })
        }

        // 2. SI NO EXISTE, LO CREAMOS EN AUTH
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: {
                nombre: nombre,     // Mandamos nombre separado
                apellido: apellido, // Mandamos apellido separado
                rol: rol,
                telefono: telefono,
                dni: dni
            }
        })

        if (authError) throw authError

        // Retornamos el usuario recién creado
        return NextResponse.json({ user: authData.user })

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 })
    }
}