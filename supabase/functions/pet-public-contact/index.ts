// Funcion publica (sin login) que resuelve la pagina de identificacion de una
// mascota a partir de su codigo publico, y recibe mensajes de quien la encontro
// (desde el cartel o desde la chapita). Usa service role porque quien llama
// puede no tener ninguna sesion de Supabase.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'AiPetFriendly <onboarding@resend.dev>';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '';
// Plantilla aprobada de WhatsApp para el aviso "encontraron a tu mascota"
// (variables: {{1}} nombre del tutor, {{2}} nombre de la mascota, {{3}} mensaje).
const TWILIO_PET_FOUND_CONTENT_SID = Deno.env.get('TWILIO_PET_FOUND_CONTENT_SID') ?? '';
const WEB_APP_URL = (Deno.env.get('APP_BASE_URL') ?? 'https://www.aipetfriendly.ar').replace(/\/$/, '');
const EMAIL_LOGO_URL = Deno.env.get('EMAIL_LOGO_URL') ?? `${WEB_APP_URL}/logo-aipetfriendly.png`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,16}$/.test(trimmed) ? trimmed : null;
}

// Resuelve un codigo publico (el propio public_code de la mascota, usado por
// /mascota y /m, o un codigo de chapita pre-generado por lote, usado por
// /chapita y /t) al id de mascota correspondiente. Los codigos de chapita se
// chequean primero porque son independientes y pueden estar "huerfanos" (sin
// ninguna mascota vinculada todavia).
async function resolveCodeToPetId(code: string): Promise<{ petId: string | null; orphan: boolean }> {
  const { data: tag } = await supabase
    .from('pet_tag_codes')
    .select('status, pet_id')
    .eq('code', code)
    .maybeSingle();

  if (tag) {
    if (tag.status === 'linked' && tag.pet_id) {
      return { petId: tag.pet_id, orphan: false };
    }
    return { petId: null, orphan: true };
  }

  const { data: pet } = await supabase
    .from('pets')
    .select('id')
    .eq('public_code', code)
    .maybeSingle();

  return { petId: pet?.id ?? null, orphan: false };
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    throw new Error('Missing RESEND_API_KEY');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend error: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function sendWhatsApp(to: string, args: { body: string; contentSid?: string; contentVariables?: Record<string, string> }) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    throw new Error('Missing Twilio WhatsApp env vars');
  }

  const normalizedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const form = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: normalizedTo,
  });

  if (args.contentSid) {
    form.set('ContentSid', args.contentSid);
    form.set('ContentVariables', JSON.stringify(args.contentVariables ?? {}));
  } else {
    form.set('Body', args.body);
  }

  const basicAuth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Twilio error: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function buildNotificationEmailHtml(args: {
  ownerName: string;
  petName: string;
  petPhotoUrl: string | null;
  source: 'cartel' | 'chapita';
  message: string | null;
  contactInfo: string | null;
  mapsUrl: string | null;
  messagesUrl: string;
}): string {
  const ownerName = escapeHtml(args.ownerName);
  const petName = escapeHtml(args.petName);
  const sourceLabel = args.source === 'chapita' ? 'la chapita' : 'el cartel';
  const message = args.message ? escapeHtml(args.message) : '';
  const contactInfo = args.contactInfo ? escapeHtml(args.contactInfo) : '';
  const petPhotoUrl = args.petPhotoUrl ? escapeHtml(args.petPhotoUrl) : '';
  const logoUrl = escapeHtml(EMAIL_LOGO_URL);
  const messagesUrl = escapeHtml(args.messagesUrl);

  return `
<!doctype html>
<html lang="es">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Aviso AiPetFriendly</title></head>
  <body style="margin:0;padding:0;background:#fff7ed;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff7ed;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #fed7aa;">
            <tr>
              <td style="background:linear-gradient(135deg,#f97316,#ea580c);padding:20px 24px;color:#ffffff;">
                <img src="${logoUrl}" alt="AiPetFriendly" width="140" style="display:block;max-width:140px;height:auto;margin-bottom:12px;" />
                <h1 style="margin:0;font-size:22px;line-height:1.2;font-weight:800;">¡Alguien encontro a ${petName}!</h1>
                <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#ffedd5;">Hola ${ownerName}, recibiste un mensaje desde ${sourceLabel}.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                ${petPhotoUrl ? `<img src="${petPhotoUrl}" alt="${petName}" style="width:100%;max-width:220px;height:auto;border-radius:14px;display:block;margin:0 auto 16px;border:1px solid #e2e8f0;" />` : ''}
                ${message ? `<div style="padding:12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;margin-bottom:10px;"><p style="margin:0;font-size:14px;color:#334155;"><strong>Mensaje:</strong> ${message}</p></div>` : ''}
                ${contactInfo ? `<div style="padding:12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;margin-bottom:10px;"><p style="margin:0;font-size:14px;color:#334155;"><strong>Contacto que dejo:</strong> ${contactInfo}</p></div>` : ''}
                ${args.mapsUrl ? `<div style="margin-top:16px;text-align:center;"><a href="${escapeHtml(args.mapsUrl)}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:999px;">Ver ubicacion en Google Maps</a></div>` : ''}
                <div style="margin-top:16px;text-align:center;">
                  <a href="${messagesUrl}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:999px;">Ver mensajes en AiPetFriendly</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: 'Missing Supabase configuration' });
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const code = normalizeCode(url.searchParams.get('code'));
      if (!code) {
        return jsonResponse(400, { error: 'Codigo invalido' });
      }

      const { petId, orphan } = await resolveCodeToPetId(code);

      if (orphan) {
        return jsonResponse(200, { orphan: true });
      }

      if (!petId) {
        return jsonResponse(404, { error: 'No encontramos una mascota con ese codigo.' });
      }

      const { data: pet, error } = await supabase
        .from('pets')
        .select('name, species, breed, photo_url')
        .eq('id', petId)
        .maybeSingle();

      if (error || !pet) {
        return jsonResponse(404, { error: 'No encontramos una mascota con ese codigo.' });
      }

      return jsonResponse(200, {
        orphan: false,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        photoUrl: pet.photo_url ?? null,
      });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const code = normalizeCode(body?.code);
      const source = body?.source === 'chapita' ? 'chapita' : body?.source === 'cartel' ? 'cartel' : null;
      const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 1000) : '';
      const contactInfo = typeof body?.contactInfo === 'string' ? body.contactInfo.trim().slice(0, 200) : '';
      const latitude = typeof body?.latitude === 'number' && Number.isFinite(body.latitude) ? body.latitude : null;
      const longitude = typeof body?.longitude === 'number' && Number.isFinite(body.longitude) ? body.longitude : null;

      if (!code || !source) {
        return jsonResponse(400, { error: 'Faltan datos requeridos (codigo/origen).' });
      }
      if (!message && !contactInfo) {
        return jsonResponse(400, { error: 'Escribe un mensaje o un dato de contacto.' });
      }

      const { petId, orphan } = await resolveCodeToPetId(code);
      if (orphan || !petId) {
        return jsonResponse(404, { error: 'Esta chapita todavia no esta vinculada a ninguna mascota.' });
      }

      const { data: pet, error: petError } = await supabase
        .from('pets')
        .select('id, name, user_id, photo_url, public_code')
        .eq('id', petId)
        .maybeSingle();

      if (petError || !pet) {
        return jsonResponse(404, { error: 'No encontramos una mascota con ese codigo.' });
      }

      const { error: insertError } = await supabase.from('pet_sighting_messages').insert({
        pet_id: pet.id,
        source,
        message: message || null,
        contact_info: contactInfo || null,
        latitude,
        longitude,
      });

      if (insertError) {
        console.error('Error inserting sighting message:', insertError);
        return jsonResponse(500, { error: 'No se pudo guardar el mensaje.' });
      }

      // Notificar al dueño (mejor esfuerzo: si falla el envio, el mensaje ya quedo guardado).
      try {
        const { data: owner } = await supabase
          .from('users')
          .select('id, email, full_name, whatsapp_phone, whatsapp_opt_in')
          .eq('id', pet.user_id)
          .maybeSingle();

        if (owner) {
          const mapsUrl = latitude != null && longitude != null
            ? `https://www.google.com/maps?q=${latitude},${longitude}`
            : null;
          const emailLocalPart = owner.email ? owner.email.split('@')[0] : '';
          const ownerName = owner.full_name?.trim() || emailLocalPart || 'tutor';

          if (owner.email && RESEND_API_KEY) {
            // Link directo a la vista de "Mensajes recibidos" de esta mascota: al abrir
            // la app con ?pet_messages=<codigo>, App.tsx selecciona la mascota y abre
            // la seccion de Identificacion (ver src/App.tsx y usePetIdentification).
            const messagesUrl = pet.public_code
              ? `${WEB_APP_URL}/?pet_messages=${encodeURIComponent(pet.public_code)}`
              : WEB_APP_URL;
            await sendEmail(
              owner.email,
              `AiPetFriendly: ¡encontraron a ${pet.name}!`,
              buildNotificationEmailHtml({
                ownerName,
                petName: pet.name,
                petPhotoUrl: pet.photo_url ?? null,
                source,
                message: message || null,
                contactInfo: contactInfo || null,
                mapsUrl,
                messagesUrl,
              }),
            );
          }

          if (owner.whatsapp_opt_in && owner.whatsapp_phone) {
            const text = `AiPetFriendly: alguien encontro a ${pet.name} y dejo un mensaje desde ${source === 'chapita' ? 'la chapita' : 'el cartel'}.${message ? ` "${message}".` : ''}${mapsUrl ? ` Ubicacion: ${mapsUrl}` : ''}`;
            const hasApprovedTemplate = TWILIO_PET_FOUND_CONTENT_SID.trim().length > 0;
            const messageForTemplate = message
              || (contactInfo ? `Dejo su contacto: ${contactInfo}` : null)
              || (mapsUrl ? 'Compartio su ubicacion.' : null)
              || 'Sin mensaje adicional.';
            await sendWhatsApp(owner.whatsapp_phone, {
              body: text,
              contentSid: hasApprovedTemplate ? TWILIO_PET_FOUND_CONTENT_SID : undefined,
              contentVariables: hasApprovedTemplate
                ? { '1': ownerName, '2': pet.name, '3': messageForTemplate }
                : undefined,
            });
          }
        }
      } catch (notifyError) {
        console.error('Error notifying owner:', notifyError);
      }

      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('pet-public-contact error:', error);
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
