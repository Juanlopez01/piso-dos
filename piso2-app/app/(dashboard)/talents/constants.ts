export type Talento = {
    id: string
    nombre: string
    categoria: 'mujeres' | 'varones' | 'obras'
    disciplina: string | null
    bio: string | null
    fotos: string[]
    video_url: string | null
    videos: string[] | null
    destacado: boolean
    activo: boolean
    orden: number
}

export const CATS = [
    { key: 'mujeres', label: 'Mujeres' },
    { key: 'varones', label: 'Varones' },
    { key: 'obras', label: 'Obras / Compañías' },
] as const

export const DISCIPLINAS = ['Bailarín/a', 'Acróbata', 'Modelo', 'Cantante', 'Músico/a', 'Influencer', 'Actor/Actriz']

export const formVacio = () => ({
    id: undefined as string | undefined,
    nombre: '', categoria: 'mujeres' as 'mujeres' | 'varones' | 'obras',
    disciplina: '', bio: '', fotos: [] as string[], videos: ['', '', ''] as string[],
    destacado: false, activo: true, orden: 0
})

export const inputCls = "w-full bg-white border border-neutral-300 rounded-lg px-4 py-3 text-sm text-neutral-900 outline-none focus:border-black transition-colors mt-1"
