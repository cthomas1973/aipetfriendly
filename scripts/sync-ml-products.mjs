#!/usr/bin/env node
// Entrada existente del cron: ahora descubre borradores, nunca publica sin aprobacion.
import { runShopRadar } from './shop-radar.mjs';
import { ShopProviderError } from '../api/_lib/mercadoLibre.mjs';

runShopRadar().then(result => {
  console.log(JSON.stringify(result));
  if (result.discovery?.status === 'limited' || result.research?.failed) process.exitCode = 1;
}).catch(error => {
  console.error('Radar no disponible:', error instanceof ShopProviderError ? error.code : 'internal_error');
  process.exitCode = 1;
});
