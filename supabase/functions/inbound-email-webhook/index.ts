import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Tolerancia de reloj para evitar ataques de replay con webhooks viejos.
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) {
    binary += String.fromCharCode(view[i]);
  }
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifySvixSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!RESEND_WEBHOOK_SECRET) {
    throw new Error('Missing RESEND_WEBHOOK_SECRET in Edge Function secrets');
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  const secretBytes = base64ToBytes(RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ''));
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent));
  const expectedSignature = bytesToBase64(signatureBytes);

  const candidates = svixSignature.split(' ');
  for (const candidate of candidates) {
    const [, value] = candidate.split(',');
    if (value && timingSafeEqual(value, expectedSignature)) {
      return true;
    }
  }

  return false;
}

async function fetchFullReceivedEmail(emailId: string) {
  const response = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend receiving API error: ${JSON.stringify(payload)}`);
  }

  return payload as {
    id: string;
    from: string;
    to: string[];
    subject: string | null;
    html: string | null;
    text: string | null;
    message_id: string | null;
    headers?: Record<string, string>;
    attachments?: Array<{ id: string; filename: string; content_type: string; size: number }>;
  };
}

async function fetchAttachmentDownloadLinks(emailId: string) {
  const response = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend attachments API error: ${JSON.stringify(payload)}`);
  }

  const data = Array.isArray(payload.data) ? payload.data : [];
  return data.map((item: { filename?: string; content_type?: string; download_url: string }) => ({
    filename: item.filename || 'adjunto',
    contentType: item.content_type || 'application/octet-stream',
    downloadUrl: item.download_url,
  }));
}

// Reenvia el correo (con los adjuntos reales, no solo un aviso) al correo personal
// del admin, para no tener que guardar archivos en la base de datos.
async function forwardAttachmentsToPersonalEmail(params: {
  from: string;
  subject: string | null;
  receivedAtIso: string;
  attachments: Array<{ filename: string; contentType: string; downloadUrl: string }>;
}) {
  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || '';
  const emailFrom = Deno.env.get('EMAIL_FROM') || 'AiPetFriendly <onboarding@resend.dev>';
  if (!adminEmail || !RESEND_API_KEY) return;

  const downloaded: Array<{ filename: string; content: string }> = [];
  for (const attachment of params.attachments) {
    try {
      const fileResponse = await fetch(attachment.downloadUrl);
      if (!fileResponse.ok) continue;
      const buffer = await fileResponse.arrayBuffer();
      downloaded.push({ filename: attachment.filename, content: bytesToBase64(buffer) });
    } catch (err) {
      console.error('inbound-email-webhook: no se pudo descargar un adjunto', err);
    }
  }

  if (downloaded.length === 0) return;

  const subject = params.subject || '(sin asunto)';
  const receivedAtLabel = new Date(params.receivedAtIso).toLocaleString('es-AR');
  const html = `
    <p>Nuevo correo recibido en <strong>notificacion@aipetfriendly.ar</strong> con adjuntos.</p>
    <p><strong>De:</strong> ${params.from}<br/>
    <strong>Asunto:</strong> ${subject}<br/>
    <strong>Fecha:</strong> ${receivedAtLabel}</p>
    <p>Los adjuntos no se guardan en el panel admin; se reenviaron a este correo para que puedas verlos.</p>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [adminEmail],
      subject: `Adjunto recibido: ${subject}`,
      html,
      attachments: downloaded,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(`Resend send (forward) error: ${JSON.stringify(payload)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const rawBody = await req.text();

    const isValid = await verifySvixSignature(req, rawBody);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(rawBody);

    if (event.type !== 'email.received') {
      return new Response(JSON.stringify({ ok: true, ignored: event.type }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailId = event.data?.email_id;
    if (!emailId) {
      return new Response(JSON.stringify({ error: 'Missing email_id in event' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const full = await fetchFullReceivedEmail(emailId);
    const inReplyTo = full.headers?.['in-reply-to'] || full.headers?.['In-Reply-To'] || null;
    const attachmentsMeta = Array.isArray(full.attachments) ? full.attachments : [];
    const hasAttachments = attachmentsMeta.length > 0;
    const receivedAtIso = event.created_at || new Date().toISOString();

    const { error } = await supabase.from('inbound_emails').upsert({
      resend_email_id: full.id,
      message_id: full.message_id,
      in_reply_to: inReplyTo,
      from_address: full.from,
      to_addresses: Array.isArray(full.to) ? full.to : [],
      subject: full.subject,
      html_body: full.html,
      text_body: full.text,
      received_at: receivedAtIso,
      has_attachments: hasAttachments,
      attachment_count: attachmentsMeta.length,
    }, { onConflict: 'resend_email_id' });

    if (error) {
      throw error;
    }

    if (hasAttachments) {
      try {
        const downloadLinks = await fetchAttachmentDownloadLinks(emailId);
        await forwardAttachmentsToPersonalEmail({
          from: full.from,
          subject: full.subject,
          receivedAtIso,
          attachments: downloadLinks,
        });
      } catch (forwardError) {
        // No hacemos fallar el webhook si el reenvio de adjuntos falla: el correo
        // y su cuerpo ya quedaron guardados igual.
        console.error('inbound-email-webhook: fallo el reenvio de adjuntos', forwardError);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('inbound-email-webhook error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
