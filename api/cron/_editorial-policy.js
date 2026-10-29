const EXCLUDED_TOPIC_RULES = [
  { code: 'diagnosis', pattern: /(?<!no )\bdiagn[oó]stic(?:o|ar|a|os)?\b|\bidentificar (?:los )?s[ií]ntomas\b|\bs[ií]ntomas? de (?:una )?(?:enfermedad|patolog[ií]a)\b/i, message: 'El tema requiere interpretar síntomas o enfermedades.' },
  { code: 'clinical_symptoms', pattern: /\b(?:convulsiones?|v[oó]mitos?|diarrea|fiebre|cojera|sangrado|dificultad para respirar|p[eé]rdida de apetito|deshidrataci[oó]n)(?=\s|[.,;:]|$)/i, message: 'El tema parte de signos que requieren evaluación clínica.' },
  { code: 'treatment', pattern: /\btratamientos?\b|\bmedicamentos?\b|\bf[aá]rmacos?\b|\bdosis\b|\bvacunaci[oó]n\b|\bdesparasitaci[oó]n\b|\binteracciones? medicamentosas?\b/i, message: 'El tema aborda tratamientos, medicamentos o decisiones clínicas.' },
  { code: 'urgent_care', pattern: /\bprimeros auxilios\b|\breanimaci[oó]n\b|\bheimlich\b|\batragant\w*\b|\b(?:intoxicaci[oó]n|envenenamiento)\b|\burgencias? veterinarias?\b/i, message: 'El tema trata una urgencia o un procedimiento de primeros auxilios.' },
  { code: 'clinical_tests', pattern: /\b(?:an[aá]lisis|estudios|resultados) veterinarios?\b|\binterpretaci[oó]n cl[ií]nica\b|\bdiagn[oó]stico por im[aá]genes\b/i, message: 'El tema requiere interpretar estudios o resultados clínicos.' },
  { code: 'therapeutic_diet', pattern: /\bdietas? terap[eé]uticas?\b|\balimentaci[oó]n para (?:la )?(?:enfermedad|diabetes|insuficiencia|patolog[ií]a)\b|\bnutrici[oó]n cl[ií]nica\b/i, message: 'El tema incluye nutrición terapéutica o recomendaciones por una patología.' },
  { code: 'clinical_claim', pattern: /\b(?:curar|tratar|prevenir|evitar) (?:la |una |las )?(?:enfermedad|infecci[oó]n|patolog[ií]a|c[aá]ncer|diabetes)\b/i, message: 'El tema promete prevenir, tratar o curar enfermedades.' },
  { code: 'invasive_procedure', pattern: /\b(?:cirug[ií]a|procedimientos? invasivos?|suturar|puntos de sutura|drenar una herida)\b/i, message: 'El tema requiere instrucciones para procedimientos potencialmente dañinos.' },
];

const REFORMULATIONS = [
  { pattern: /\b(?:ansiedad|estr[eé]s|miedo|angustia)\b/i, title: 'Cómo organizar cambios de rutina y espacios tranquilos para tu mascota' },
  { pattern: /\b(?:nutrici[oó]n cl[ií]nica|peso|obesidad)\b/i, title: 'Cómo organizar los horarios y recursos de la alimentación habitual de tu mascota' },
  { pattern: /\b(?:senior|adulto mayor|edad avanzada)\b/i, title: 'Cómo adaptar el hogar y las rutinas cotidianas a las preferencias de tu mascota' },
];

const EXCLUDED_CONTENT_RULES = [
  { code: 'diagnosis', pattern: /(?<!no )\bdiagn[oó]stic(?:o|ar|a|os)?\b|\bidentificar (?:los )?s[ií]ntomas\b|\bs[ií]ntomas? de (?:una )?(?:enfermedad|patolog[ií]a)\b/i, message: 'El texto requiere interpretar síntomas o enfermedades.' },
  { code: 'clinical_symptoms', pattern: /\b(?:convulsiones?|v[oó]mitos?|diarrea|fiebre|cojera|sangrado|dificultad para respirar|p[eé]rdida de apetito|deshidrataci[oó]n)(?=\s|[.,;:]|$)/i, message: 'El texto trata signos que requieren evaluación clínica.' },
  { code: 'treatment_instruction', pattern: /\b(?:recet[aá]|indic[aá]|administr[aá]|suspend[eé]|cambi[aá]|ajust[aá]|combin[aá]|aument[aá]|reduc[ií])(?=\s|[.,;:]|$).{0,80}\b(?:medicamento|medicaci[oó]n|f[aá]rmaco|dosis|tratamiento)\b|\b\d+(?:[.,]\d+)?\s*(?:mg|ml|mcg)\b/i, message: 'El texto da instrucciones de medicación o tratamiento.' },
  { code: 'clinical_treatment', pattern: /\btratamientos? (?:para|de) (?:la )?(?:enfermedad|patolog[ií]a|s[ií]ntoma)|\bmedicamentos? para (?:curar|tratar|prevenir)\b/i, message: 'El texto recomienda tratamientos clínicos.' },
  { code: 'symptom_triage', pattern: /\b(?:si|cuando|ante) (?:tu )?(?:mascota|perro|gato) (?:presenta|tiene|muestra)\b.{0,100}\b(?:s[ií]ntoma|dolor|v[oó]mito|convulsi[oó]n|sangrado|dificultad para respirar)\b/i, message: 'El texto propone actuar o interpretar signos de salud.' },
  { code: 'urgent_care', pattern: /\bprimeros auxilios\b|\breanimaci[oó]n\b|\bheimlich\b|\batragant\w*\b|\b(?:intoxicaci[oó]n|envenenamiento)\b|\burgencias? veterinarias?\b/i, message: 'El texto trata una urgencia o un procedimiento de primeros auxilios.' },
  { code: 'clinical_tests', pattern: /\b(?:an[aá]lisis|estudios|resultados) veterinarios?\b|\binterpretaci[oó]n cl[ií]nica\b|\bdiagn[oó]stico por im[aá]genes\b/i, message: 'El texto interpreta estudios o resultados clínicos.' },
  { code: 'therapeutic_diet', pattern: /\bdietas? terap[eé]uticas?\b|\balimentaci[oó]n para (?:la )?(?:enfermedad|diabetes|insuficiencia|patolog[ií]a)\b|\bnutrici[oó]n cl[ií]nica\b/i, message: 'El texto incluye nutrición terapéutica o recomendaciones por una patología.' },
  { code: 'clinical_claim', pattern: /\b(?:curar|tratar|prevenir|evitar) (?:la |una |las )?(?:enfermedad|infecci[oó]n|patolog[ií]a|c[aá]ncer|diabetes)\b/i, message: 'El texto promete prevenir, tratar o curar enfermedades.' },
  { code: 'invasive_procedure', pattern: /\b(?:cirug[ií]a|procedimientos? invasivos?|suturar|puntos de sutura|drenar una herida)\b/i, message: 'El texto describe procedimientos potencialmente dañinos.' },
];

export function evaluateEditorialTopic(input) {
  const text = typeof input === 'string'
    ? input
    : [input?.title, input?.topic, input?.reader_need, input?.takeaway].filter(Boolean).join('\n');
  const excluded = EXCLUDED_TOPIC_RULES.find((rule) => rule.pattern.test(text));
  if (excluded) return { status: 'excluded', code: excluded.code, reason: excluded.message, clinicalClaims: [excluded.code] };

  const reformulation = REFORMULATIONS.find((rule) => rule.pattern.test(text));
  if (reformulation) return { status: 'reformulate', code: 'clinical_adjacent', reason: 'El tema puede acercarse a salud o condiciones individuales; reformulalo como organización cotidiana.', suggestedTitle: reformulation.title, clinicalClaims: [] };
  return { status: 'allowed', code: 'everyday_care', reason: 'Tema de cuidado cotidiano sin una intención clínica identificada.', clinicalClaims: [] };
}

export function validateEditorialTopic(input) {
  const initial = evaluateEditorialTopic(input);
  if (initial.status === 'excluded') return { ...initial, validated: false };
  if (initial.status === 'reformulate') {
    const reformulated = evaluateEditorialTopic(initial.suggestedTitle);
    return { ...initial, validated: reformulated.status === 'allowed', reformulated };
  }
  return { ...initial, validated: true };
}

export function evaluateEditorialContent({ title, topic, reader_need, takeaway, content }) {
  const contentText = String(content || '');
  const topicReview = evaluateEditorialTopic({ title, topic, reader_need, takeaway });
  const contentIssue = EXCLUDED_CONTENT_RULES.find((rule) => rule.pattern.test(contentText));
  const medicationParagraphs = contentText.split(/\n{2,}/).filter((paragraph) => /\bmedicaci[oó]n|medicamentos?|f[aá]rmacos?\b/i.test(paragraph));
  const safeMedicationLogistics = medicationParagraphs.length > 0 && medicationParagraphs.every((paragraph) =>
    /\b(?:prescrit[ao]|indicad[ao])\b.{0,70}\bveterinari[oa]\b/i.test(paragraph)
    && /\b(?:deja|dej[aá]|anota|anot[aá]|compart[ií])(?=\s|[.,;:]|$).{0,80}\b(?:instrucciones|indicaciones) vigentes\b/i.test(paragraph)
    && !/\b\d+(?:[.,]\d+)?\s*(?:mg|ml|mcg)\b|\b(?:cambi[aá]|ajust[aá]|suspend[eé]|combin[aá])\b.{0,70}\b(?:medicamento|medicaci[oó]n|f[aá]rmaco|dosis)\b/i.test(paragraph));
  if (topicReview.status === 'excluded') return { status: 'excluded', code: topicReview.code, reason: topicReview.reason, clinicalClaims: topicReview.clinicalClaims };
  if (topicReview.status === 'reformulate') return { status: 'reformulate', code: topicReview.code, reason: topicReview.reason, suggestedTitle: topicReview.suggestedTitle, clinicalClaims: [] };
  if (contentIssue && !(contentIssue.code === 'treatment_instruction' && safeMedicationLogistics)) return { status: 'excluded', code: contentIssue.code, reason: contentIssue.message, clinicalClaims: [contentIssue.code] };
  return { status: 'allowed', code: 'everyday_care', reason: 'El tema y el contenido se mantienen dentro del cuidado cotidiano.', clinicalClaims: [] };
}