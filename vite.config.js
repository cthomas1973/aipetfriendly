import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
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
