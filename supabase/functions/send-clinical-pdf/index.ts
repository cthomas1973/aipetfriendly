import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmailWithResend(
  to: string,
  subject: string,
  html: string,
  fileName: string,
  pdfBytes: Uint8Array,
) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const emailFrom = Deno.env.get("EMAIL_FROM") || "AiPetFriendly <onboarding@resend.dev>";

  if (!resendApiKey) {
    throw new Error("Missing RESEND_API_KEY in Edge Function secrets");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [to],
      subject,
      html,
      attachments: [
        {
          filename: fileName,
          content: encodeBase64(pdfBytes),
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend error: ${JSON.stringify(payload)}`);
  }

  return payload;
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    // Validar que sea POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Only POST requests are supported" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obtener datos del request
    const { email, fileName, pdfBytes, petName } = await req.json();

    if (!email || !fileName || !pdfBytes) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, fileName, pdfBytes" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const safePetName = typeof petName === "string" && petName.trim().length > 0
      ? petName.trim()
      : "tu mascota";

    // Obtener cliente Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Convertir bytes a Uint8Array para Deno Edge Runtime
    const pdfBuffer = new Uint8Array(pdfBytes);

    // Guardar en Supabase Storage (bucket: clinical-pdfs)
    const pdfBlob = new Blob([pdfBuffer], { type: "application/pdf" });

    let { data: uploadData, error: uploadError } = await supabase.storage
      .from("clinical-pdfs")
      .upload(`${crypto.randomUUID()}_${fileName}`, pdfBlob, {
        contentType: "application/pdf",
      });

    if (uploadError && /Bucket not found/i.test(uploadError.message || "")) {
      const { error: createBucketError } = await supabase.storage.createBucket("clinical-pdfs", {
        public: true,
      });

      if (createBucketError && !/already exists/i.test(createBucketError.message || "")) {
        return new Response(
          JSON.stringify({ error: "Failed to create storage bucket", detail: createBucketError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const retry = await supabase.storage
        .from("clinical-pdfs")
        .upload(`${crypto.randomUUID()}_${fileName}`, pdfBlob, {
          contentType: "application/pdf",
        });

      uploadData = retry.data;
      uploadError = retry.error;
    }

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload PDF", detail: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Construir URL pública del PDF
    const { data: publicUrlData } = supabase.storage
      .from("clinical-pdfs")
      .getPublicUrl(uploadData.path);

    const pdfUrl = publicUrlData.publicUrl;

    await sendEmailWithResend(
      email,
      `AiPetFriendly - Historial Clinico de ${safePetName}`,
      `<h2>Historial Clinico de ${safePetName}</h2>
       <p>Tu informe ya esta disponible para descargar.</p>
       <p><a href="${pdfUrl}" target="_blank" rel="noopener noreferrer">Descargar PDF</a></p>
       <p>Si no solicitaste este envio, puedes ignorar este mensaje.</p>`,
      fileName,
      pdfBuffer,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "PDF enviado correctamente",
        pdfUrl,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
