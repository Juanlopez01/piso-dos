// Redimensiona y comprime una imagen en el cliente, convirtiéndola a JPEG.
// - Normaliza el formato (todo sale .jpg, web-compatible).
// - Baja el peso para no gastar ancho de banda / Edge Requests.
// Si el navegador no puede decodificar el archivo (ej: HEIC en Chrome),
// devuelve el original sin romper el flujo de subida.

type Opts = { maxDim?: number; quality?: number }

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(file)
        } catch {
            // seguimos con el fallback de <img>
        }
    }
    return await new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
        img.src = url
    })
}

export async function optimizeImage(file: File, opts: Opts = {}): Promise<File> {
    const maxDim = opts.maxDim ?? 1600
    const quality = opts.quality ?? 0.82

    const pareceImagen = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|bmp|tiff?)$/i.test(file.name)
    if (!pareceImagen) return file

    try {
        const bitmap = await loadBitmap(file)
        let width = (bitmap as any).width
        let height = (bitmap as any).height
        if (!width || !height) return file

        if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height)
            width = Math.round(width * scale)
            height = Math.round(height * scale)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return file

        // Fondo blanco por si la imagen original tiene transparencia (PNG → JPEG)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height)

        if (typeof (bitmap as ImageBitmap).close === 'function') {
            (bitmap as ImageBitmap).close()
        }

        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
        if (!blob) return file

        const baseName = file.name.replace(/\.[^.]+$/, '') || 'imagen'
        return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
    } catch {
        // No se pudo decodificar (HEIC en Chrome, archivo corrupto, etc.)
        return file
    }
}
