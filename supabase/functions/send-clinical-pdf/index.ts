import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import {
  CLINICAL_PDF_LIMITS,
  buildClinicalPdfStoragePath,
  escapeHtml,
  validateClinicalPdfRequest,
  validateRequestId,
} from "../_shared/clinicalPdfPolicy.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function readPayload(req: Request): Promise<Record<string, unknown>> {
  // Un byte JSON puede ocupar cuatro caracteres ("255,").
  const maxBodyBytes = CLINICAL_PDF_LIMITS.maxBytes * 4 + 16384;
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Cuerpo requerido.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBodyBytes) {
      await reader.cancel();
      throw new RangeError("La solicitud supera el tamano permitido.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Cuerpo invalido.");
  }
  return payload;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function handleClinicalPdf(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Solo se permite POST." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceKey || !resendKey) {
    console.error("Falta configuracion del servicio de PDF.");
    return jsonResponse(503, { error: "El servicio de envio no esta disponible." });
  }
  const admin = createClient(supabaseUrl, serviceKey);
  let reservation: { userId: string; requestId: string; stage: "reserved" | "sending" } | null = null;
  let knownProviderId: string | null = null;
  const transition = async (status: string, providerId: string | null = null) => {
    if (!reservation) throw new Error("No existe reserva.");
    const { data, error } = await admin.rpc("transition_clinical_pdf_send", {
      p_user: reservation.userId, p_request: reservation.requestId,
      p_status: status, p_provider_id: providerId,
    });
    if (error || !data) throw new Error("No se pudo registrar el estado del envio.");
    return data;
  };

  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return jsonResponse(401, { error: "Inicia sesion para enviar PDF." });
    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    if (!jwt || authError || !user?.id || !user.email
      || ("is_anonymous" in user && user.is_anonymous === true)) {
      return jsonResponse(401, { error: "Inicia sesion con una cuenta registrada para enviar PDF." });
    }

    let payload: Record<string, unknown>;
    try {
      payload = await readPayload(req);
    } catch (error) {
      return jsonResponse(error instanceof RangeError ? 413 : 400, {
        error: error instanceof RangeError ? error.message : "Cuerpo de la solicitud invalido.",
      });
    }
    const requestId = validateRequestId(payload.requestId);
    if (!requestId) return jsonResponse(400, { error: "Se requiere requestId UUID para evitar duplicados." });
    const petId = validateRequestId(payload.pet_id);
    if (!petId) return jsonResponse(403, { error: "Se requiere una mascota valida para autorizar el informe." });
    const { data: pet, error: petError } = await admin.from("pets")
      .select("id,user_id").eq("id", petId).maybeSingle();
    if (petError) {
      console.error("No se pudo comprobar la propiedad de la mascota:", petError.code);
      return jsonResponse(503, { error: "No se pudo verificar la autorizacion del informe. No se envio correo." });
    }
    if (!pet) return jsonResponse(404, { error: "Mascota no encontrada." });
    if (pet.user_id !== user.id) {
      return jsonResponse(403, { error: "No tenes autorizacion para enviar informes de esta mascota." });
    }
    // La propiedad autoriza el envio, incluso en Free. El PDF recibido del
    // cliente no constituye contenido clinico certificado por el servidor.
    const validation = validateClinicalPdfRequest(payload);
    if (!validation.ok) return jsonResponse(validation.status, { error: validation.error });
    const { email, fileName, petNameHtml, reportTitleHtml, subject } = validation.value;
    const pdfBuffer = Uint8Array.from(payload.pdfBytes as number[]);
    const payloadHash = await sha256(new TextEncoder().encode(JSON.stringify({
      email, fileName, petNameHtml, reportTitleHtml, pdfHash: await sha256(pdfBuffer),
    })));

    // El RPC resuelve plan/gracia/cancelacion desde users + subscriptions.
    // Solo recibe la identidad verificada; ignora plan/user_id del payload.
    const { data: booking, error: reserveError } = await admin.rpc("reserve_clinical_pdf_send", {
      p_user: user.id, p_request: requestId, p_payload_hash: payloadHash,
    });
    if (reserveError || !booking) {
      console.error("Fallo al reservar envio PDF:", reserveError?.code);
      return jsonResponse(reserveError?.code === "42501" ? 403 : 503, {
        error: "No se pudo autorizar el envio ni comprobar el cupo. No se envio correo.",
      });
    }
    if (booking.result === "sent") {
      return jsonResponse(200, { success: true, replayed: true, quota: booking.quota });
    }
    if (booking.result !== "reserved") {
      const messages: Record<string, string> = {
        quota_exceeded: "Alcanzaste el cupo de envios de tu plan para este periodo.",
        rate_limited: "Alcanzaste el limite tecnico de intentos. Proba mas tarde.",
        conflict: "La clave de envio ya fue usada con otro contenido.",
        failed: "Este intento fallo sin enviar correo. Inicia un nuevo envio.",
        pending: "El envio anterior sigue pendiente de confirmacion. No se repetira para evitar duplicados.",
      };
      return jsonResponse(["quota_exceeded", "rate_limited"].includes(booking.result) ? 429 : 409, {
        error: messages[booking.result] || "Estado de envio no reconocido.",
        code: booking.result, quota: booking.quota,
      });
    }
    reservation = { userId: user.id, requestId, stage: "reserved" };
    const { data: bucketInfo, error: bucketError } = await admin.storage.getBucket("clinical-pdfs");
    if (bucketError || !bucketInfo || bucketInfo.public !== false) {
      throw new Error("Se requiere el bucket clinical-pdfs privado.");
    }
    const storagePath = buildClinicalPdfStoragePath(user.id, requestId, fileName);
    if (!storagePath) throw new Error("Ruta de archivo invalida.");
    const bucket = admin.storage.from("clinical-pdfs");
    const { error: uploadError } = await bucket.upload(storagePath, new Blob([pdfBuffer], {
      type: "application/pdf",
    }), { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error("No se pudo almacenar el PDF en el bucket privado.");

    const { data: signedData, error: signedError } = await bucket.createSignedUrl(storagePath, 7 * 86400);
    if (signedError) console.warn("No se pudo firmar el PDF; se enviara solo el adjunto.");
    const pdfUrl = signedData?.signedUrl ?? null;
    const html = `<h2>${reportTitleHtml} de ${petNameHtml}</h2>
      <p>Adjuntamos el informe en PDF.</p>
      ${pdfUrl ? `<p><a href="${escapeHtml(pdfUrl)}" rel="noopener noreferrer">Descargar PDF</a> (valido por 7 dias)</p>` : ""}
      <p>Enviado desde la cuenta ${escapeHtml(user.email)} en AiPetFriendly.
      Si no esperabas este correo, puedes ignorarlo.</p>`;

    await transition("sending");
    reservation.stage = "sending";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `clinical-pdf/${user.id}/${requestId}`,
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") || "AiPetFriendly <onboarding@resend.dev>",
        to: [email], subject, html,
        attachments: [{ filename: fileName, content: encodeBase64(pdfBuffer) }],
      }),
    });
    // Solo un rechazo inequivoco libera cupo. 408/409/5xx son ambiguos.
    if (!response.ok) {
      const definiteFailure = response.status >= 400 && response.status < 500
        && ![408, 409].includes(response.status);
      const quota = await transition(definiteFailure ? "failed" : "uncertain");
      reservation = null;
      console.error("Proveedor rechazo envio PDF:", response.status);
      return jsonResponse(502, {
        error: definiteFailure
          ? "El proveedor rechazo el correo. No se consumio cupo; podes iniciar otro envio."
          : "No se pudo confirmar el envio. La reserva se conserva para evitar duplicados.",
        code: definiteFailure ? "delivery_failed" : "delivery_uncertain", quota,
      });
    }
    const providerPayload = await response.json();
    if (typeof providerPayload.id !== "string" || !providerPayload.id) {
      throw new Error("El proveedor no devolvio confirmacion.");
    }
    knownProviderId = providerPayload.id;
    const quota = await transition("sent", knownProviderId);
    reservation = null;
    return jsonResponse(200, { success: true, pdfUrl, quota });
  } catch (error) {
    console.error("Fallo de envio PDF:", error instanceof Error ? error.message : "Error desconocido");
    let quota: unknown;
    const uncertain = reservation?.stage === "sending";
    if (reservation) {
      try {
        quota = await transition(uncertain ? "uncertain" : "failed", knownProviderId);
      } catch {
        console.error("No se pudo cerrar la reserva PDF; requiere conciliacion.", {
          userId: reservation.userId, requestId: reservation.requestId, providerId: knownProviderId,
        });
      }
    }
    return jsonResponse(503, {
      error: uncertain
        ? "El envio no pudo confirmarse. No lo repitas: la reserva requiere conciliacion."
        : "No se pudo completar el envio. Consulta el cupo antes de reintentar.",
      code: uncertain ? "delivery_uncertain" : "delivery_failed", quota,
    });
  }
}

serve(handleClinicalPdf);
