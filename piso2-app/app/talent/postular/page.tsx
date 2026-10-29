import { redirect } from 'next/navigation'

// La postulación suelta se reemplazó por el PERFIL con cuenta (usuario y
// contraseña). Mantenemos la ruta vieja redirigiendo al registro.
export default function PostularRedirect() {
    redirect('/talent/registro')
}
