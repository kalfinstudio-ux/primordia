import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

// Alamat publik situs. Saat domain sendiri sudah dibeli, cukup ganti nilai ini
// (atau set VITE_SITE_URL di GitHub Actions) — semua canonical, og:image, sitemap & robots ikut berubah.
const SITE_URL = (process.env.VITE_SITE_URL || 'https://kalfinstudio-ux.github.io/primordia').replace(/\/+$/, '');

/** Mengganti __SITE_URL__ di semua HTML, lalu membuat sitemap.xml & robots.txt saat build. */
function seoPlugin(): Plugin {
  const pages = [
    { path: '/', priority: '1.0' },
    { path: '/studio/', priority: '0.8' },
    { path: '/play/', priority: '0.7' },
  ];
  return {
    name: 'primordia-seo',
    transformIndexHtml: {
      order: 'pre',
      handler: (html: string) => html.split('__SITE_URL__').join(SITE_URL),
    },
    generateBundle() {
      const day = new Date().toISOString().slice(0, 10);
      const urls = pages
        .map((p) => `  <url><loc>${SITE_URL}${p.path}</loc><lastmod>${day}</lastmod><priority>${p.priority}</priority></url>`)
        .join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
      });
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), seoPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      // Tiga halaman: landing (index.html), game (play/index.html), aset studio (studio/index.html).
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          play: path.resolve(__dirname, 'play/index.html'),
          studio: path.resolve(__dirname, 'studio/index.html'),
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
