import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FEEDBACK_TYPES = ["sugerencia", "reclamo", "otro"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendEmailWithResend(replyTo: string, subject: string, html: string) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const emailFrom = Deno.env.get("EMAIL_FROM") || "AiPetFriendly <onboarding@resend.dev>";
  const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || "";

  if (!resendApiKey) {
    throw new Error("Missing RESEND_API_KEY in Edge Function secrets");
  }
  if (!adminEmail) {
    throw new Error("Missing ADMIN_NOTIFICATION_EMAIL in Edge Function secrets");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [adminEmail],
      reply_to: replyTo,
      subject,
      html,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend error: ${JSON.stringify(payload)}`);
  }

  return payload;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Only POST requests are supported" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));

    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    const email = typeof body.email === "string" ? body.email.trim().slice(0, 320) : "";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
    const type = FEEDBACK_TYPES.includes(body.type) ? body.type : "sugerencia";
    const page = typeof body.page === "string" ? body.page.trim().slice(0, 200) : null;
    const userId = typeof body.userId === "string" && body.userId.length > 0 ? body.userId : null;

    if (!email || !message) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos: email y message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: insertError } = await supabase.from("feedback_messages").insert({
      user_id: userId,
      name: name || null,
      email,
      type,
      message,
      page,
    });

    if (insertError) {
      // No bloqueamos el envio del email por un error al guardar el registro.
      console.error("Error guardando feedback_messages:", insertError);
    }

    const typeLabel = type === "reclamo" ? "Reclamo" : type === "otro" ? "Consulta" : "Sugerencia";

    await sendEmailWithResend(
      email,
      `AiPetFriendly - Nueva ${typeLabel.toLowerCase()} de un usuario`,
      `<h2>${escapeHtml(typeLabel)} recibida</h2>
       <p><strong>De:</strong> ${escapeHtml(name || "Sin nombre")} (${escapeHtml(email)})</p>
       ${page ? `<p><strong>Pantalla:</strong> ${escapeHtml(page)}</p>` : ""}
       <p><strong>Mensaje:</strong></p>
       <p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>
       <p style="color:#64748b;font-size:12px;margin-top:16px;">Puedes responder directamente a este email para contestarle al usuario.</p>`,
    );

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error en send-feedback:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
