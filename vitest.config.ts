import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Esta maquina (12 nucleos, ~8 GB de RAM) satura la memoria si Vitest lanza un worker por nucleo: los workers no arrancan y
// aparecen "Test timed out" que no son fallos reales. Se limita a 2 workers; no se excluye ninguna prueba.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    maxWorkers: 2,
  },
}));
