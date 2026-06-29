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

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing bearer token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as RequestPayload;
    const petId = payload.petId?.trim();
    const question = payload.question?.trim();
    const recentMessages = normalizeTurns(payload.recentMessages);

    if (!petId || !question) {
      return new Response(JSON.stringify({ error: "petId and question are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
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

    return new Response(JSON.stringify(ai), {
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
