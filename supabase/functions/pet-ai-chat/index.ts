import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type RequestPayload = {
  petId?: string;
  question?: string;
  recentMessages?: ChatTurn[];
  // Imagen adjunta (data URL base64, ej. "data:image/jpeg;base64,...") para analisis visual.
  imageBase64?: string | null;
  // "weight_insight": analisis proactivo automatico al registrar un nuevo peso (no cuenta
  // contra el cupo de consultas IA del usuario, no es una pregunta manual del tutor).
  mode?: "chat" | "weight_insight";
  previousWeightKg?: number;
  currentWeightKg?: number;
  daysBetween?: number;
  guestContext?: {
    pet?: {
      id?: string;
      name?: string;
      species?: string;
      breed?: string;
      sex?: string;
      ageYears?: number;
      ageMonths?: number;
      weightKg?: number;
      notes?: string | null;
    };
    clinicalEntries?: Array<{
      eventDate?: string;
      category?: string;
      title?: string;
      description?: string;
    }>;
    preventiveTasks?: Array<{
      dueDate?: string;
      category?: string;
      title?: string;
      completed?: boolean;
      notes?: string | null;
    }>;
  };
};

type Tier = "guest" | "free" | "premium";

type UsageSettingsRow = {
  guest_limit_per_pet: number;
  free_limit_per_pet: number;
  premium_limit_per_pet: number;
};

type UserProfileRow = {
  access_mode: Tier;
  full_name: string | null;
};

// Deriva un nombre "amigable" a partir de la parte local del email (lo que esta
// antes de la arroba), para usar como nombre del tutor cuando no cargo full_name
// (mismo criterio que send-preventive-reminders/index.ts).
function deriveNameFromEmail(email: string): string {
  const localPart = email.split("@")[0]?.trim() ?? "";
  if (!localPart) {
    return "tutor";
  }

  const cleaned = localPart.replace(/[._+\-0-9]+/g, " ").trim();
  if (!cleaned) {
    return "tutor";
  }

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type PetRow = {
  id: string;
  user_id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  age_years: number | null;
  age_months: number | null;
  weight_kg: number | null;
  notes: string | null;
};

type ClinicalRow = {
  event_date: string;
  category: string;
  title: string;
  description: string;
};

type PreventiveRow = {
  due_date: string;
  category: string;
  title: string;
  completed: boolean;
  notes: string | null;
};

type UsageRow = {
  usage_count: number;
  period_key: string;
};

// ~4.5MB decodificados (base64 agrega ~33%). El cliente ya redimensiona/comprime
// la imagen antes de enviarla (target ~1024px), esto es solo una red de
// seguridad server-side ante un cliente modificado o un caso raro.
const MAX_IMAGE_BASE64_LENGTH = 6_000_000;
const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i;

// Valida el formato del data URL de la imagen antes de reenviarlo al proveedor
// de IA o subirlo a Storage. Solo se aceptan imagenes auto-contenidas en
// base64 (nunca una URL remota arbitraria: evita que el usuario fuerce al
// proveedor de IA o a nuestro storage a resolver una URL de terceros).
function sanitizeImageDataUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length > MAX_IMAGE_BASE64_LENGTH) {
    throw new Error("La imagen es demasiado grande.");
  }

  if (!IMAGE_DATA_URL_PATTERN.test(trimmed)) {
    throw new Error("Formato de imagen invalido (se espera un data URL base64 de png/jpeg/webp).");
  }

  return trimmed;
}

function imageMimeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/[a-z]+);base64,/i);
  return match ? match[1].toLowerCase() : "image/jpeg";
}

function imageExtensionFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

// deno-lint-ignore no-explicit-any
async function uploadChatImage(admin: any, imageDataUrl: string): Promise<string | null> {
  try {
    const mime = imageMimeFromDataUrl(imageDataUrl);
    const base64 = imageDataUrl.slice(imageDataUrl.indexOf(",") + 1);
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const fileName = `${crypto.randomUUID()}.${imageExtensionFromMime(mime)}`;

    let { error: uploadError } = await admin.storage.from("chat-images").upload(fileName, blob, {
      contentType: mime,
    });

    if (uploadError && /Bucket not found/i.test(uploadError.message || "")) {
      const { error: createBucketError } = await admin.storage.createBucket("chat-images", { public: true });
      if (createBucketError && !/already exists/i.test(createBucketError.message || "")) {
        console.error("No se pudo crear el bucket chat-images:", createBucketError.message);
        return null;
      }
      const retry = await admin.storage.from("chat-images").upload(fileName, blob, { contentType: mime });
      uploadError = retry.error;
    }

    if (uploadError) {
      console.error("Error subiendo imagen de chat a Storage:", uploadError.message);
      return null;
    }

    const { data: publicUrlData } = admin.storage.from("chat-images").getPublicUrl(fileName);
    return publicUrlData?.publicUrl || null;
  } catch (error) {
    console.error("Error inesperado subiendo imagen de chat:", error);
    return null;
  }
}

function currentUsagePeriodKey(): string {
  // Formato 'YYYY-MM' en UTC, alineado con to_char(now(), 'YYYY-MM') en Postgres.
  return new Date().toISOString().slice(0, 7);
}

function estimateTokensFromText(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }

  // Estimacion simple: ~4 caracteres por token
  return Math.max(1, Math.ceil(text.length / 4));
}

function resolveLimitByTier(settings: UsageSettingsRow, tier: Tier): number {
  if (tier === "guest") return settings.guest_limit_per_pet;
  if (tier === "premium") return settings.premium_limit_per_pet;
  return settings.free_limit_per_pet;
}

function normalizeGuestPet(payload: RequestPayload): PetRow | null {
  const pet = payload.guestContext?.pet;
  if (!pet || !pet.name) {
    return null;
  }

  return {
    id: String(pet.id || crypto.randomUUID()),
    user_id: "guest",
    name: String(pet.name || "Mascota"),
    species: String(pet.species || "other"),
    breed: pet.breed ? String(pet.breed) : null,
    sex: pet.sex ? String(pet.sex) : null,
    age_years: typeof pet.ageYears === "number" ? pet.ageYears : null,
    age_months: typeof pet.ageMonths === "number" ? pet.ageMonths : null,
    weight_kg: typeof pet.weightKg === "number" ? pet.weightKg : null,
    notes: pet.notes ? String(pet.notes) : null,
  };
}

function normalizeGuestClinical(payload: RequestPayload): ClinicalRow[] {
  const entries = payload.guestContext?.clinicalEntries;
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => ({
      event_date: String(entry.eventDate || ""),
      category: String(entry.category || "clinical_note"),
      title: String(entry.title || "Sin titulo"),
      description: String(entry.description || "Sin descripcion"),
    }))
    .filter((entry) => entry.event_date.length > 0)
    .slice(0, 30);
}

function normalizeGuestPreventive(payload: RequestPayload): PreventiveRow[] {
  const tasks = payload.guestContext?.preventiveTasks;
  if (!Array.isArray(tasks)) return [];

  return tasks
    .map((task) => ({
      due_date: String(task.dueDate || ""),
      category: String(task.category || "other"),
      title: String(task.title || "Sin titulo"),
      completed: Boolean(task.completed),
      notes: task.notes ? String(task.notes) : null,
    }))
    .filter((task) => task.due_date.length > 0)
    .slice(0, 30);
}

function normalizeTurns(turns: ChatTurn[] | undefined): ChatTurn[] {
  if (!Array.isArray(turns)) {
    return [];
  }

  return turns
    .filter((turn) => (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string")
    .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
    .filter((turn) => turn.content.length > 0)
    .slice(-10);
}

function formatPetProfile(pet: PetRow): string {
  const ageParts: string[] = [];
  if (typeof pet.age_years === "number" && pet.age_years >= 0) {
    ageParts.push(`${pet.age_years} anios`);
  }
  if (typeof pet.age_months === "number" && pet.age_months >= 0) {
    ageParts.push(`${pet.age_months} meses`);
  }

  return [
    `Nombre: ${pet.name}`,
    `Especie: ${pet.species}`,
    `Raza: ${pet.breed ?? "no informada"}`,
    `Sexo: ${pet.sex ?? "no informado"}`,
    `Edad: ${ageParts.length > 0 ? ageParts.join(" y ") : "no informada"}`,
    `Peso: ${typeof pet.weight_kg === "number" ? `${pet.weight_kg} kg` : "no informado"}`,
    `Notas: ${pet.notes?.trim() || "sin notas"}`,
  ].join("\n");
}

function formatClinicalTimeline(entries: ClinicalRow[]): string {
  if (entries.length === 0) {
    return "Sin registros clinicos recientes.";
  }

  return entries
    .map((entry) => {
      const title = entry.title?.trim() || "Sin titulo";
      const description = entry.description?.trim() || "Sin descripcion";
      return `- ${entry.event_date} | ${entry.category} | ${title} | ${description}`;
    })
    .join("\n");
}

function formatPreventiveTasks(tasks: PreventiveRow[]): string {
  if (tasks.length === 0) {
    return "Sin tareas preventivas recientes.";
  }

  return tasks
    .map((task) => {
      const status = task.completed ? "completada" : "pendiente";
      return `- ${task.due_date} | ${task.category} | ${task.title} | ${status} | ${task.notes?.trim() || "sin notas"}`;
    })
    .join("\n");
}

function buildPrompt(
  pet: PetRow,
  clinicalEntries: ClinicalRow[],
  preventiveTasks: PreventiveRow[],
  question: string,
  recentMessages: ChatTurn[],
  hasImage: boolean,
): string {
  const recentConversation = recentMessages.length === 0
    ? "Sin historial de chat previo."
    : recentMessages.map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`).join("\n");

  const today = new Date().toISOString().slice(0, 10);

  return [
    `Fecha actual: ${today}`,
    "",
    "PERFIL DE LA MASCOTA:",
    formatPetProfile(pet),
    "",
    "HISTORIAL CLINICO (mas reciente primero):",
    formatClinicalTimeline(clinicalEntries),
    "",
    "AGENDA / PREVENTIVOS (mas recientes primero):",
    formatPreventiveTasks(preventiveTasks),
    "",
    "HISTORIAL DE CONVERSACION RECIENTE:",
    recentConversation,
    "",
    hasImage ? "El usuario adjunto una imagen (foto de la mascota o de una zona puntual, ej. piel, ojo, oido, herida). Analizala junto con el resto del contexto." : "",
    "PREGUNTA DEL USUARIO:",
    question,
    "",
    "INSTRUCCIONES DE RESPUESTA:",
    "1. Responde en espanol claro y accionable.",
    "2. Personaliza usando explicitamente los datos de esta mascota.",
    "3. Si faltan datos para una recomendacion segura, dilo y pide lo minimo necesario.",
    "4. Incluye alertas de urgencia cuando corresponda (veterinario inmediato).",
    "5. No inventes diagnosticos ni estudios que no aparecen en el historial.",
    ...(hasImage
      ? [
          "5b. Describe de forma objetiva lo que se observa en la imagen adjunta (color, forma, tamano relativo, ubicacion, si hay inflamacion/secrecion/perdida de pelo, etc.) antes de dar recomendaciones.",
          "5c. Un analisis de imagen por IA NO es un diagnostico: acláralo explicitamente y, ante cualquier signo de urgencia (sangrado activo, dificultad respiratoria, dolor intenso, hinchazon marcada, letargo severo), recomienda consulta veterinaria inmediata en vez de esperar.",
        ]
      : []),
    "6. Si sugieres medicacion, alimento, suplemento o cualquier producto, debes incluir SIEMPRE una seccion llamada 'Dosificacion orientativa (sugerencia)'.",
    "7. En esa seccion, la dosificacion debe estar adaptada a especie, edad, peso, raza/tamano e historial de esta mascota (si algun dato falta, indicalo y da un rango conservador o pide el dato faltante antes de usar el producto).",
    "8. La dosificacion debe ser concreta y practica (por ejemplo mg/kg, ml, comprimidos o porcion diaria segun corresponda), evitando afirmaciones absolutas.",
    "9. Debe quedar MUY claro que es una sugerencia inicial y que requiere validacion veterinaria previa, especialmente en cachorros/geriatrico, embarazo, enfermedad cronica o medicacion concomitante.",
    "10. Cierra siempre con: 'Esta guia es solo orientativa y no reemplaza la consulta veterinaria presencial.'",
    "11. IMPORTANTE - Si tu respuesta sugiere el uso de un producto o medicacion en venta libre (shampoo, champu, antipulgas, alimento especial, suplemento, cepillo, arena sanitaria, cama, correa, etc.), SIEMPRE agrega al FINAL de tu respuesta, en una linea aparte, exactamente este formato (nunca lo menciones ni lo expliques al usuario, es un dato tecnico oculto para el sistema):",
    'PRODUCT_SUGGESTION: {"query": "palabras clave del producto en español", "grupo": "alimentos|accesorios|higiene|descanso"}',
    "Ejemplo: si recomendaste 'un baño con champú suave' para la piel de un perro, agrega: PRODUCT_SUGGESTION: {\"query\": \"shampoo perro piel sensible\", \"grupo\": \"higiene\"}",
    "Si no corresponde sugerir ningun producto (por ejemplo, si la respuesta es solo orientacion general o requiere atencion veterinaria urgente), NO agregues esa linea.",
    "12. IMPORTANTE - Distingue entre el descargo de responsabilidad de rutina (punto 10, que va SIEMPRE) y una recomendacion real de que la mascota sea atendida presencialmente por un veterinario (por ejemplo: sintomas de urgencia, algo que no se resuelve con cuidados en casa, una lesion/mancha/hinchazon que requiere revision fisica o estudios, empeoramiento sostenido, etc.). SOLO en ese segundo caso, agrega al FINAL de tu respuesta (despues de la linea de PRODUCT_SUGGESTION si la hubiera), en una linea aparte, exactamente este formato (nunca lo menciones ni lo expliques al usuario, es un dato tecnico oculto para el sistema):",
    "VET_VISIT_RECOMMENDED: true",
    "No agregues esa linea si tu respuesta es solo orientacion general/preventiva que el tutor puede manejar en casa sin necesidad de una consulta presencial en el corto plazo.",
  ].join("\n");
}

// Prompt para el aviso proactivo automatico que se dispara al registrar un nuevo peso
// (no es una respuesta a una pregunta del tutor, sino un analisis breve tipo notificacion).
function buildWeightInsightPrompt(
  pet: PetRow,
  ownerName: string,
  previousWeightKg: number,
  currentWeightKg: number,
  daysBetween: number,
): string {
  const changeKg = currentWeightKg - previousWeightKg;
  const changePct = previousWeightKg > 0 ? (changeKg / previousWeightKg) * 100 : 0;
  const direction = changeKg > 0 ? "aumento" : changeKg < 0 ? "disminucion" : "sin cambios";
  const speciesLabel = pet.species === "cat" ? "gato" : "perro";

  return [
    "Sos un asistente veterinario preventivo. Tu tarea es generar un aviso proactivo BREVE (no es la respuesta a una pregunta del tutor) sobre la evolucion de peso de una mascota.",
    `Nombre del tutor/a: ${ownerName}. Si te diriges a el/ella por su nombre, usa exactamente ese nombre. NUNCA uses la palabra generica "tutor" como forma de dirigirte a la persona.`,
    `Mascota: ${pet.name}, especie ${pet.species}, raza ${pet.breed || "no especificada"}, edad ${pet.age_years ?? 0} anios y ${pet.age_months ?? 0} meses, sexo ${pet.sex || "no especificado"}.`,
    `Peso anterior: ${previousWeightKg} kg. Peso actual: ${currentWeightKg} kg. Cambio: ${changeKg.toFixed(2)} kg (${changePct.toFixed(1)}% de ${direction}) en ${daysBetween} dias.`,
    "INSTRUCCIONES:",
    "1. Compara ese cambio contra el rango de peso esperable para esa raza/especie/edad segun tu conocimiento general (es una estimacion aproximada, no una tabla exacta).",
    `2. Si el cambio es significativo (en general, mas de 10% en pocos meses) escribe un aviso corto y calido dirigido a ${ownerName} (maximo 3 oraciones): menciona el porcentaje de cambio, si eso lo aleja del peso ideal, y una sugerencia concreta (revisar la cantidad/tipo de alimento, o consultar al veterinario si preocupa). Cierra invitando a consultarte sobre la dieta cuando quiera.`,
    "3. Si el cambio NO es significativo o es esperable para su etapa de crecimiento/edad, responde con un aviso breve y tranquilizador (1-2 oraciones), sin alarmar.",
    "4. Si el analisis sugiere sobrepeso (aumento marcado, por encima del rango esperable), podes agregar al FINAL de tu respuesta, en una linea aparte, exactamente este formato (nunca lo menciones ni lo expliques al usuario, es un dato tecnico oculto para el sistema):",
    `PRODUCT_SUGGESTION: {"query": "alimento control de peso ${speciesLabel}", "grupo": "alimentos"}`,
    "No agregues esa linea si no hay indicio de sobrepeso.",
    "5. Si la perdida de peso es brusca/marcada o el cambio es preocupante al punto de requerir revision presencial, agrega al final (en linea aparte, nunca lo menciones al usuario) exactamente:",
    "VET_VISIT_RECOMMENDED: true",
    "No agregues esa linea si no hace falta una consulta presencial en el corto plazo.",
    "Responde en espanol, tono cercano, sin tecnicismos innecesarios, maximo 3 oraciones (sin contar las lineas ocultas del final).",
  ].join("\n");
}

async function callAiModel(prompt: string, imageDataUrl?: string | null) {
  const apiKey = Deno.env.get("AI_API_KEY") || "";
  const model = Deno.env.get("AI_MODEL") || "gpt-4o-mini";
  const baseUrl = (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");

  if (!apiKey) {
    throw new Error("Missing AI_API_KEY in Edge Function secrets");
  }

  // Si hay imagen, el mensaje del usuario va como contenido multimodal
  // (texto + imagen), formato soportado por modelos con vision como
  // gpt-4o / gpt-4o-mini via la misma API de chat completions.
  // "detail: auto" deja que el propio modelo elija resolucion baja/alta segun
  // el tamano de la imagen recibida: minimiza tokens cuando la imagen ya es
  // chica/simple, sin perder detalle en fotos mas grandes/complejas (evita
  // forzar "high" siempre, que es la opcion mas cara).
  const userContent = imageDataUrl
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUrl, detail: "auto" } },
      ]
    : prompt;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente veterinario preventivo. Debes ser prudente, preciso y responsable. Nunca presentes una dosis como orden medica definitiva: siempre como sugerencia orientativa y con recomendacion de confirmacion veterinaria. Si el usuario adjunta una imagen, analizala con cautela: describe lo que se observa objetivamente y aclara siempre que un analisis visual por IA no reemplaza un examen fisico veterinario.",
        },
        {
          role: "user",
          content: userContent,
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`AI provider error: ${JSON.stringify(payload)}`);
  }

  const answer = payload?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || answer.trim().length === 0) {
    throw new Error("AI provider returned an empty answer");
  }

  const providerPromptTokens = Number(payload?.usage?.prompt_tokens || 0);
  const providerCompletionTokens = Number(payload?.usage?.completion_tokens || 0);
  const providerTotalTokens = Number(payload?.usage?.total_tokens || 0);

  const estimatedPromptTokens = providerPromptTokens > 0
    ? providerPromptTokens
    : estimateTokensFromText(prompt);
  const estimatedCompletionTokens = providerCompletionTokens > 0
    ? providerCompletionTokens
    : estimateTokensFromText(answer);
  const estimatedTotalTokens = providerTotalTokens > 0
    ? providerTotalTokens
    : estimatedPromptTokens + estimatedCompletionTokens;

  return {
    answer: answer.trim(),
    model,
    tokenUsage: {
      promptTokens: estimatedPromptTokens,
      completionTokens: estimatedCompletionTokens,
      totalTokens: estimatedTotalTokens,
    },
  };
}

type SuggestedProduct = {
  title: string;
  thumbnail: string | null;
  price: number | null;
  link: string;
};

// Normaliza texto para matching: minusculas, sin tildes/dieresis.
// Evita perder matches por 'champú' vs 'champu', 'antiparasitario' vs 'antiparasitarios', etc.
function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Sinonimos comunes entre lo que dice la IA y como se titulan los productos reales en ML.
// Si una palabra de la query coincide con una clave, tambien se busca su valor (y viceversa).
const SYNONYMS: Record<string, string[]> = {
  champu: ["shampoo"],
  shampoo: ["champu"],
  antipulgas: ["pulgas", "antiparasitario", "antiparasitarios"],
  pulgas: ["antipulgas"],
  garrapatas: ["antipulgas", "antiparasitario"],
  antiparasitario: ["antipulgas", "pulgas"],
  suplemento: ["vitaminas", "complemento"],
  articulaciones: ["articular", "condroprotector"],
  cucha: ["cama"],
  arena: ["sanitaria"],
};

function expandWithSynonyms(words: string[]): string[] {
  const expanded = new Set(words);
  for (const w of words) {
    for (const syn of SYNONYMS[w] || []) {
      expanded.add(syn);
    }
  }
  return [...expanded];
}

// Palabras clave conocidas de productos frecuentes en veterinaria/petshop, usadas como
// red de seguridad: si la IA no agrego el marcador PRODUCT_SUGGESTION (a veces el modelo
// no lo respeta), se escanea igual la respuesta ya limpia por estos terminos para no
// perder la oportunidad de recomendar un producto real del catalogo.
const FALLBACK_KEYWORDS: Array<{ pattern: RegExp; query: string; grupo: string }> = [
  { pattern: /champ[uú]|shampoo/i, query: "shampoo", grupo: "higiene" },
  { pattern: /antipulgas|garrapatas/i, query: "antipulgas", grupo: "higiene" },
  { pattern: /arena sanitaria|arena para gato/i, query: "arena sanitaria", grupo: "higiene" },
  { pattern: /suplemento|condroprotector|articula/i, query: "suplemento articular", grupo: "higiene" },
  { pattern: /alimento hipoalerg[eé]nic\w*|dieta hipoalerg[eé]nic\w*/i, query: "alimento hipoalergenico", grupo: "alimentos" },
  { pattern: /cama ortop[eé]dica|colchoneta/i, query: "cama ortopedica", grupo: "descanso" },
  { pattern: /correa|pretal|arn[eé]s/i, query: "correa pretal", grupo: "accesorios" },
  { pattern: /cepillo|deslanador/i, query: "cepillo deslanador", grupo: "higiene" },
];

function findFallbackKeyword(text: string): { query: string; grupo: string } | null {
  for (const entry of FALLBACK_KEYWORDS) {
    if (entry.pattern.test(text)) {
      return { query: entry.query, grupo: entry.grupo };
    }
  }
  return null;
}

// Extrae el marcador oculto PRODUCT_SUGGESTION del texto de la IA y lo remueve
// de la respuesta visible al usuario. Si el modelo no incluyo el marcador,
// se aplica un fallback por palabras clave sobre el texto ya limpio (ver
// findFallbackKeyword) para no depender 100% de que el modelo cumpla la
// instruccion. Nunca se inventa un link: solo indica una intencion de
// busqueda (query + grupo) que luego se matchea contra nuestro propio
// catalogo curado (beneficios_productos), nunca contra Mercado Libre en vivo
// (la API de ML bloquea las IPs de Supabase Edge Functions con 403, igual
// que bloquea Vercel y GitHub Actions).
function extractProductSuggestion(answer: string): { cleanAnswer: string; query: string | null; grupo: string | null } {
  const match = answer.match(/PRODUCT_SUGGESTION:\s*(\{[^\n]*\})/i);

  if (match) {
    const cleanAnswer = answer.replace(match[0], "").trim();
    try {
      const parsed = JSON.parse(match[1]);
      const query = typeof parsed.query === "string" && parsed.query.trim() ? parsed.query.trim() : null;
      const grupo = typeof parsed.grupo === "string" && parsed.grupo.trim() ? parsed.grupo.trim() : null;
      if (query) return { cleanAnswer, query, grupo };
    } catch {
      // sigue al fallback de palabras clave con el cleanAnswer
    }
    const fallback = findFallbackKeyword(cleanAnswer);
    return { cleanAnswer, query: fallback?.query ?? null, grupo: fallback?.grupo ?? null };
  }

  // El modelo no incluyo el marcador: buscar palabras clave conocidas igual.
  const fallback = findFallbackKeyword(answer);
  return { cleanAnswer: answer, query: fallback?.query ?? null, grupo: fallback?.grupo ?? null };
}

// Red de seguridad por si la IA no agrego el marcador VET_VISIT_RECOMMENDED
// pese a describir una situacion de urgencia real (no solo el descargo de
// rutina del punto 10 del prompt, que aparece en TODAS las respuestas).
const VET_VISIT_FALLBACK_PATTERNS = [
  /consult(a|e|ar).{0,40}(veterinari\w*).{0,20}(inmediat\w*|urgen\w*|cuanto antes|lo antes posible|sin demora)/i,
  /(llev\w+|acud\w+|acerc\w+).{0,40}(veterinari\w*).{0,20}(inmediat\w*|urgen\w*|cuanto antes|lo antes posible)/i,
  /(emergencia|urgencia)\s+veterinaria/i,
];

function findFallbackVetVisitSignal(text: string): boolean {
  return VET_VISIT_FALLBACK_PATTERNS.some((pattern) => pattern.test(text));
}

// Extrae el marcador oculto VET_VISIT_RECOMMENDED del texto de la IA (ya
// limpio de PRODUCT_SUGGESTION) y lo remueve de la respuesta visible. A
// diferencia del descargo de responsabilidad generico (que va siempre), este
// marcador indica que la situacion puntual requiere que la mascota sea
// llevada fisicamente a una veterinaria. Si el modelo no lo agrega pero el
// texto igual describe una urgencia clara, se detecta por patrones como red
// de seguridad (ver findFallbackVetVisitSignal).
function extractVetVisitRecommendation(answer: string): { cleanAnswer: string; recommendVetVisit: boolean } {
  const match = answer.match(/VET_VISIT_RECOMMENDED:\s*(true|false)/i);

  if (match) {
    const cleanAnswer = answer.replace(match[0], "").trim();
    return { cleanAnswer, recommendVetVisit: match[1].toLowerCase() === "true" };
  }

  return { cleanAnswer: answer, recommendVetVisit: findFallbackVetVisitSignal(answer) };
}

function getMattToolId(): string {
  const template = Deno.env.get("ML_AFFILIATE_TEMPLATE") || "";
  if (template) {
    try {
      const url = new URL(template);
      const value = url.searchParams.get("matt_tool");
      if (value) return value;
    } catch {
      const m = template.match(/[?&]matt_tool=([^&\s]+)/);
      if (m) return m[1];
    }
  }
  return Deno.env.get("ML_AFFILIATE_ID") || "";
}

// deno-lint-ignore no-explicit-any
async function findSuggestedProduct(admin: any, query: string, grupoHint: string | null, species: string): Promise<SuggestedProduct | null> {
  const baseWords = normalizeText(query)
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 6);

  const words = expandWithSynonyms(baseWords);
  if (words.length === 0) return null;

  const orFilter = words.map((w) => `title.ilike.%${w}%`).join(",");

  let dbQuery = admin
    .from("beneficios_productos")
    .select("title,thumbnail,price,permalink,grupo,pet_types")
    .eq("active", true)
    .or(orFilter)
    .limit(20);

  if (grupoHint && ["alimentos", "accesorios", "higiene", "descanso"].includes(grupoHint)) {
    dbQuery = dbQuery.eq("grupo", grupoHint);
  }

  const { data, error } = await dbQuery;
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const petType = species === "cat" ? "gato" : species === "dog" ? "perro" : null;

  type Candidate = { title: string; thumbnail: string | null; price: number | null; permalink: string; pet_types: string[] };

  const scored = (data as Candidate[])
    .filter((p) => !petType || (Array.isArray(p.pet_types) && (p.pet_types.includes(petType) || p.pet_types.includes("otro"))))
    .map((p) => {
      const titleNormalized = normalizeText(p.title);
      const score = words.reduce((acc, w) => acc + (titleNormalized.includes(w) ? 1 : 0), 0);
      return { ...p, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;

  const mattTool = getMattToolId();
  const link = mattTool
    ? `${best.permalink}${best.permalink.includes("?") ? "&" : "?"}matt_tool=${encodeURIComponent(mattTool)}`
    : best.permalink;

  return {
    title: best.title,
    thumbnail: best.thumbnail,
    price: best.price,
    link,
  };
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Only POST requests are supported" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as RequestPayload;
    const petId = payload.petId?.trim();
    const question = payload.question?.trim();
    const recentMessages = normalizeTurns(payload.recentMessages);

    if (!question) {
      return new Response(JSON.stringify({ error: "question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let imageDataUrl: string | null = null;
    try {
      imageDataUrl = sanitizeImageDataUrl(payload.imageBase64);
    } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Imagen invalida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cuando hay imagen, el costo en tokens ya sube por la propia imagen: se
    // recorta el historial de chat que se reenvia en el prompt (el contexto
    // conversacional pesa menos que la foto para este tipo de consulta) para
    // compensar y mantener el costo total acotado sin resignar calidad del
    // analisis visual en si.
    const promptRecentMessages = imageDataUrl ? recentMessages.slice(-4) : recentMessages;

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();

    const { data: settingsRowData, error: settingsError } = await admin
      .from("ai_usage_settings")
      .select("guest_limit_per_pet,free_limit_per_pet,premium_limit_per_pet")
      .eq("singleton", true)
      .single<UsageSettingsRow>();

    if (settingsError || !settingsRowData) {
      throw new Error(`Error loading AI usage settings: ${settingsError?.message || "not found"}`);
    }

    if (!jwt) {
      // Los invitados no tienen acceso Premium: la subida de imagenes queda
      // bloqueada tambien para el modo visitante.
      if (imageDataUrl) {
        return new Response(JSON.stringify({ error: "La subida de imagenes es una funcion Premium." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const guestPet = normalizeGuestPet(payload);
      if (!guestPet) {
        return new Response(JSON.stringify({ error: "guestContext.pet is required for visitor mode" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const prompt = buildPrompt(
        guestPet,
        normalizeGuestClinical(payload),
        normalizeGuestPreventive(payload),
        question,
        promptRecentMessages,
        Boolean(imageDataUrl),
      );

      const ai = await callAiModel(prompt, imageDataUrl);
      const limit = resolveLimitByTier(settingsRowData, "guest");

      const { cleanAnswer: cleanAnswerProduct, query, grupo } = extractProductSuggestion(ai.answer);
      const { cleanAnswer, recommendVetVisit } = extractVetVisitRecommendation(cleanAnswerProduct);
      let suggestedProduct: SuggestedProduct | null = null;
      if (query) {
        try {
          suggestedProduct = await findSuggestedProduct(admin, query, grupo, guestPet.species);
        } catch {
          suggestedProduct = null;
        }
      }

      return new Response(JSON.stringify({
        ...ai,
        answer: cleanAnswer,
        suggestedProduct,
        recommendVetVisit,
        // No se persiste la imagen de un visitante (no hay historial guest en DB).
        imageUrl: null,
        usage: {
          tier: "guest",
          limit,
          used: 0,
          remaining: limit,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!petId) {
      return new Response(JSON.stringify({ error: "petId is required for authenticated mode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("access_mode,full_name")
      .eq("id", user.id)
      .single<UserProfileRow>();

    if (profileError || !profile) {
      throw new Error(`Error loading user profile: ${profileError?.message || "not found"}`);
    }

    const tier = profile.access_mode === "premium"
      ? "premium"
      : profile.access_mode === "guest"
        ? "guest"
        : "free";

    // La subida de imagenes para analisis visual es una funcion Premium. Se
    // valida tambien server-side (no solo se oculta/deshabilita en el
    // cliente) porque cualquiera podria llamar a este endpoint directo.
    if (imageDataUrl && tier !== "premium") {
      return new Response(JSON.stringify({ error: "La subida de imagenes es una funcion Premium." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aviso proactivo automatico al registrar un nuevo peso: no es una consulta manual
    // del tutor, asi que NO consume el cupo de consultas IA (no toca ai_pet_usage ni
    // ai_query_logs). Requiere datos de peso validos ademas del petId ya validado arriba.
    if (payload.mode === "weight_insight") {
      const previousWeightKg = Number(payload.previousWeightKg);
      const currentWeightKg = Number(payload.currentWeightKg);
      const daysBetween = Number(payload.daysBetween);

      if (!(previousWeightKg > 0) || !(currentWeightKg > 0) || !(daysBetween > 0)) {
        return new Response(JSON.stringify({ error: "Datos de peso invalidos para el analisis." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: insightPet, error: insightPetError } = await admin
        .from("pets")
        .select("id,user_id,name,species,breed,sex,age_years,age_months,weight_kg,notes")
        .eq("id", petId)
        .eq("user_id", user.id)
        .maybeSingle<PetRow>();

      if (insightPetError) {
        throw new Error(`Error loading pet profile: ${insightPetError.message}`);
      }
      if (!insightPet) {
        return new Response(JSON.stringify({ error: "Pet not found for this user" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const insightPrompt = buildWeightInsightPrompt(
        insightPet,
        profile.full_name?.trim() || deriveNameFromEmail(user.email || ""),
        previousWeightKg,
        currentWeightKg,
        daysBetween,
      );
      const insightAi = await callAiModel(insightPrompt, null);

      const { cleanAnswer: cleanAnswerProduct, query, grupo } = extractProductSuggestion(insightAi.answer);
      const { cleanAnswer, recommendVetVisit } = extractVetVisitRecommendation(cleanAnswerProduct);

      let suggestedProduct: SuggestedProduct | null = null;
      if (query) {
        try {
          suggestedProduct = await findSuggestedProduct(admin, query, grupo, insightPet.species);
        } catch {
          suggestedProduct = null;
        }
      }

      return new Response(JSON.stringify({
        answer: cleanAnswer,
        suggestedProduct,
        recommendVetVisit,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limit = resolveLimitByTier(settingsRowData, tier);

    const { data: usageRow } = await admin
      .from("ai_pet_usage")
      .select("usage_count,period_key")
      .eq("user_id", user.id)
      .eq("pet_id", petId)
      .maybeSingle<UsageRow>();

    const currentPeriod = currentUsagePeriodKey();
    const usedBefore = usageRow?.period_key === currentPeriod ? Number(usageRow?.usage_count || 0) : 0;
    if (usedBefore >= limit) {
      return new Response(JSON.stringify({
        error: "AI limit reached for this pet",
        usage: {
          tier,
          limit,
          used: usedBefore,
          remaining: 0,
        },
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pet, error: petError } = await admin
      .from("pets")
      .select("id,user_id,name,species,breed,sex,age_years,age_months,weight_kg,notes")
      .eq("id", petId)
      .eq("user_id", user.id)
      .maybeSingle<PetRow>();

    if (petError) {
      throw new Error(`Error loading pet profile: ${petError.message}`);
    }

    if (!pet) {
      return new Response(JSON.stringify({ error: "Pet not found for this user" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: clinicalRows, error: clinicalError }, { data: preventiveRows, error: preventiveError }] =
      await Promise.all([
        admin
          .from("clinical_entries")
          .select("event_date,category,title,description")
          .eq("pet_id", pet.id)
          .order("event_date", { ascending: false })
          .limit(30),
        admin
          .from("preventive_tasks")
          .select("due_date,category,title,completed,notes")
          .eq("pet_id", pet.id)
          .order("due_date", { ascending: false })
          .limit(30),
      ]);

    if (clinicalError) {
      throw new Error(`Error loading clinical history: ${clinicalError.message}`);
    }

    if (preventiveError) {
      throw new Error(`Error loading preventive tasks: ${preventiveError.message}`);
    }

    const prompt = buildPrompt(
      pet,
      (clinicalRows || []) as ClinicalRow[],
      (preventiveRows || []) as PreventiveRow[],
      question,
      promptRecentMessages,
      Boolean(imageDataUrl),
    );

    const ai = await callAiModel(prompt, imageDataUrl);

    const { cleanAnswer: cleanAnswerProduct, query, grupo } = extractProductSuggestion(ai.answer);
    const { cleanAnswer, recommendVetVisit } = extractVetVisitRecommendation(cleanAnswerProduct);
    ai.answer = cleanAnswer;
    let suggestedProduct: SuggestedProduct | null = null;
    if (query) {
      try {
        suggestedProduct = await findSuggestedProduct(admin, query, grupo, pet.species);
      } catch {
        suggestedProduct = null;
      }
    }

    // Se sube recien aca (con la IA ya respondida OK) para no gastar Storage
    // en imagenes de consultas que fallaron.
    const imageUrl = imageDataUrl ? await uploadChatImage(admin, imageDataUrl) : null;

    const usedAfter = usedBefore + 1;
    const { error: upsertUsageError } = await admin
      .from("ai_pet_usage")
      .upsert(
        {
          user_id: user.id,
          pet_id: pet.id,
          usage_count: usedAfter,
          period_key: currentPeriod,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,pet_id" },
      );

    if (upsertUsageError) {
      throw new Error(`Error updating AI usage: ${upsertUsageError.message}`);
    }

    const { error: auditError } = await admin
      .from("ai_query_logs")
      .insert({
        user_id: user.id,
        pet_id: pet.id,
        tier,
        model: ai.model,
        question_chars: question.length,
        answer_chars: ai.answer.length,
        estimated_prompt_tokens: ai.tokenUsage.promptTokens,
        estimated_completion_tokens: ai.tokenUsage.completionTokens,
        estimated_total_tokens: ai.tokenUsage.totalTokens,
      });

    if (auditError) {
      throw new Error(`Error writing AI query audit: ${auditError.message}`);
    }

    return new Response(JSON.stringify({
      ...ai,
      suggestedProduct,
      imageUrl,
      recommendVetVisit,
      usage: {
        tier,
        limit,
        used: usedAfter,
        remaining: Math.max(0, limit - usedAfter),
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
