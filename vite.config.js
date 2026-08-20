import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
var isWindows = process.platform === 'win32';
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            includeAssets: ['logo-aipetfriendly.png', 'robots.txt'],
            manifest: {
                name: 'AiPetFriendly - Cuidado inteligente para tu mascota',
                short_name: 'AiPetFriendly',
                description: 'Consultorio veterinario con IA, agenda de vacunas y desparasitaciones, historial clinico y mapa de veterinarias cercanas.',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                background_color: '#F1E5D0',
                theme_color: '#2E7D32',
                lang: 'es',
                icons: [
                    {
                        src: '/icons/icon-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any',
                    },
                    {
                        src: '/icons/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any',
                    },
                    {
                        src: '/icons/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
                navigateFallbackDenylist: [/^\/api\//],
            },
        }),
    ],
    server: isWindows
        ? {
            watch: {
                usePolling: true,
                interval: 200,
                ignorePermissionErrors: true,
                awaitWriteFinish: {
                    stabilityThreshold: 700,
                    pollInterval: 100,
                },
            },
        }
        : undefined,
    define: {
        'process.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL),
        'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (!id.includes('node_modules')) {
                        return undefined;
                    }
                    if (id.includes('react') || id.includes('scheduler')) {
                        return 'react-vendor';
                    }
                    if (id.includes('@supabase')) {
                        return 'supabase-vendor';
                    }
                    if (id.includes('lucide-react')) {
                        return 'icons-vendor';
                    }
                    return 'vendor';
                },
            },
        },
    },
});
