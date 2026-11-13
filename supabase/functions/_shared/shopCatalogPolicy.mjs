export function shopCategory(title, group) {
  const text = String(title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (group === 'salud') return 'salud';
  if (/clicker|entrenamiento|adiestramiento/.test(text)) return 'entrenamiento';
  if (/juguete|pelota|rascador|mordedor/.test(text)) return 'juguetes';
  if (/correa|pretal|arnes|collar|transportadora/.test(text)) return 'paseo';
  if (group === 'accesorios') return 'descanso';
  return ['alimentos', 'higiene', 'descanso', 'tecnologia'].includes(group) ? group : 'descanso';
}
