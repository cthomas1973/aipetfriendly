const disclaimer = 'Esta guía es orientativa y no reemplaza la consulta veterinaria presencial.';

// Menciones comerciales que el modelo no puede hacer en texto libre: los
// productos solo se ofrecen desde el catalogo verificado por el servidor.
const COMMERCIAL_SENTENCE = /\b(marcas?|compr[aáeo]\w*|adquir\w+|ofertas?|descuentos?)\b|https?:\/\/|www\.|\$\s?\d/i;

function sanitizeModelAnswer(modelAnswer) {
  if (typeof modelAnswer !== 'string') return '';
  return modelAnswer
    .split('\n')
    .map(line => line
      .split(/(?<=[.!?])\s+/)
      .filter(sentence => !COMMERCIAL_SENTENCE.test(sentence))
      .join(' ')
      .trim())
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join('\n')
    .trim();
}

export function safeAiResponse({ mode, question, modelAnswer = '', products = [], hasImage = false, searched = false }) {
  if (mode === 'shopping') {
    if (!products.length) {
      return 'No hay productos compatibles verificados disponibles para esta respuesta. Podés consultar con un veterinario sobre criterios generales de selección.';
    }
    return `Productos con compatibilidad verificada para esta mascota:\n${products.map(product => `- ${product.title}`).join('\n')}\nLa compatibilidad no garantiza adecuación clínica. Revisá los detalles antes de decidir y consultá al veterinario cuando corresponda.`;
  }
  if (mode === 'weight_insight') {
    const insight = sanitizeModelAnswer(modelAnswer);
    if (insight) return insight;
    return 'Registrá la evolución del peso y consultá al veterinario para interpretar los cambios según la edad, el tamaño y la salud de la mascota.';
  }
  if (hasImage) {
    return `No puedo ofrecer una interpretación confiable de la imagen en esta respuesta. Si observás dolor intenso, dificultad para respirar, sangrado o un empeoramiento rápido, buscá atención veterinaria urgente. ${disclaimer}`;
  }
  const sanitized = sanitizeModelAnswer(modelAnswer);
  if (sanitized) {
    const commercial = searched && !products.length
      ? ' No hay productos compatibles verificados disponibles para esta búsqueda.'
      : '';
    const withDisclaimer = /no (reemplaza|sustituye)/i.test(sanitized) ? sanitized : `${sanitized}\n\n${disclaimer}`;
    return `${withDisclaimer}${commercial}`;
  }
  const text = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let advice = 'Observá los cambios de conducta y las necesidades de tu mascota. Ante síntomas persistentes, dudas o cambios importantes, consultá al veterinario.';
  if (/\b(agua|hidratacion|hidratar)\b/.test(text)) {
    advice = 'Mantené agua limpia y fresca disponible y observá si cambia la cantidad que bebe. Consultá al veterinario ante cambios marcados o síntomas.';
  } else if (/\b(paseo|pasear|ejercicio|actividad)\b/.test(text)) {
    advice = 'Adaptá la actividad a la edad y condición de tu mascota, con descansos y agua disponible. Consultá al veterinario si aparece cansancio inusual o dolor.';
  } else if (/\b(alimentacion|alimentar|comida|dieta)\b/.test(text)) {
    advice = 'Una alimentación adecuada depende de la edad, condición y salud de la mascota. Consultá al veterinario antes de cambios importantes en la dieta.';
  }
  const commercial = searched && !products.length
    ? ' No hay productos compatibles verificados disponibles para esta búsqueda.'
    : '';
  return `${advice}${commercial} ${disclaimer}`;
}
