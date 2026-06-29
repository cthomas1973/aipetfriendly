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
};

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
};

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
    "PREGUNTA DEL USUARIO:",
    question,
    "",
    "INSTRUCCIONES DE RESPUESTA:",
    "1. Responde en espanol claro y accionable.",
    "2. Personaliza usando explicitamente los datos de esta mascota.",
    "3. Si faltan datos para una recomendacion segura, dilo y pide lo minimo necesario.",
    "4. Incluye alertas de urgencia cuando corresponda (veterinario inmediato).",
    "5. No inventes diagnosticos ni estudios que no aparecen en el historial.",
    "6. Cierra con: 'Esta guia no reemplaza la consulta veterinaria presencial.'",
  ].join("\n");
}

async function callAiModel(prompt: string) {
  const apiKey = Deno.env.get("AI_API_KEY") || "";
  const model = Deno.env.get("AI_MODEL") || "gpt-4o-mini";
  const baseUrl = (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");

  if (!apiKey) {
    throw new Error("Missing AI_API_KEY in Edge Function secrets");
  }

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
            "Eres un asistente veterinario preventivo. Debes ser prudente, preciso y responsable.",
        },
        {
          role: "user",
          content: prompt,
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

  return {
    answer: answer.trim(),
    model,
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
        recentMessages,
      );

      const ai = await callAiModel(prompt);
      const limit = resolveLimitByTier(settingsRowData, "guest");

      return new Response(JSON.stringify({
        ...ai,
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
      .select("access_mode")
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

    const limit = resolveLimitByTier(settingsRowData, tier);

    const { data: usageRow } = await admin
      .from("ai_pet_usage")
      .select("usage_count")
      .eq("user_id", user.id)
      .eq("pet_id", petId)
      .maybeSingle<UsageRow>();

    const usedBefore = Number(usageRow?.usage_count || 0);
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
      recentMessages,
    );

    const ai = await callAiModel(prompt);

    const usedAfter = usedBefore + 1;
    const { error: upsertUsageError } = await admin
      .from("ai_pet_usage")
      .upsert(
        {
          user_id: user.id,
          pet_id: pet.id,
          usage_count: usedAfter,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,pet_id" },
      );

    if (upsertUsageError) {
      throw new Error(`Error updating AI usage: ${upsertUsageError.message}`);
    }

    return new Response(JSON.stringify({
      ...ai,
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
