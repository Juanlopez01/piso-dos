/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Las imágenes ya las sirve el CDN de Supabase. Desactivamos la optimización
    // de Vercel para no consumir la cuota de "Image Optimization - Transformations"
    // (que estaba causando imágenes rotas al excederse en el plan free).
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'wkmeuddxzevpmfynuyyr.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;