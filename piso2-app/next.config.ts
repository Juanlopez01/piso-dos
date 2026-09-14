/** @type {import('next').NextConfig} */
const nextConfig = {
  compiler: {
    // En producción elimina console.log/info/debug (ruido y posible fuga de
    // datos), pero conserva console.error y console.warn para diagnosticar.
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
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