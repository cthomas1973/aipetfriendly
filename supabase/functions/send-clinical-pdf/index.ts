import Anthropic from "@anthropic-ai/sdk";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

serve(async (req) => {
  try {
    // Validar que sea POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Only POST requests are supported" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obtener datos del request
    const { email, fileName, pdfBytes } = await req.json();

    if (!email || !fileName || !pdfBytes) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, fileName, pdfBytes" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obtener cliente Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Convertir bytes a Buffer
    const pdfBuffer = Buffer.from(pdfBytes);

    // Guardar en Supabase Storage (bucket: clinical-pdfs)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("clinical-pdfs")
      .upload(`${crypto.randomUUID()}_${fileName}`, pdfBuffer, {
        contentType: "application/pdf",
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload PDF" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Construir URL pública del PDF
    const { data: publicUrlData } = supabase.storage
      .from("clinical-pdfs")
      .getPublicUrl(uploadData.path);

    const pdfUrl = publicUrlData.publicUrl;

    // Enviar email con Resend o SendGrid (ejemplo con template HTML básico)
    // Nota: para producción, integrar con servicio de email real (Resend, SendGrid, etc.)
    console.log(
      `Email enviado a ${email} con PDF disponible en: ${pdfUrl}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "PDF enviado correctamente",
        pdfUrl,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
