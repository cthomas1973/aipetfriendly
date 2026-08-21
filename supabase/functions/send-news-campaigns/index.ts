import { createClient } from '@supabase/supabase-js';

interface CampaignRow {
  id: string;
  subject: string;
  body_text: string;
  image_url: string | null;
  button_text: string | null;
  button_url: string | null;
}

interface OptedInUserRow {
  id: string;
  email: string;
  full_name: string | null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'AiPetFriendly <onboarding@resend.dev>';
const NEWS_CAMPAIGNS_API_KEY = Deno.env.get('NEWS_CAMPAIGNS_API_KEY') ?? '';
const WEB_APP_URL = (Deno.env.get('APP_BASE_URL') ?? 'https://www.aipetfriendly.ar').replace(/\/$/, '');
const EMAIL_LOGO_URL = Deno.env.get('EMAIL_LOGO_URL') ?? `${WEB_APP_URL}/logo-aipetfriendly.png`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Convierte texto plano (con saltos de linea) en parrafos HTML, escapando primero
// para evitar inyeccion de markup desde el textarea del admin.
function textToHtmlParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(block).replaceAll('\n', '<br />')}</p>`)
    .join('');
}

function deriveNameFromEmail(email: string): string {
  const localPart = email.split('@')[0]?.trim() ?? '';
  if (!localPart) {
    return 'tutor';
  }
  const cleaned = localPart.replace(/[._+\-0-9]+/g, ' ').trim();
  if (!cleaned) {
    return 'tutor';
  }
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Mismo formato visual que el resto de las notificaciones de AiPetFriendly (header
// con gradiente y logo, cuerpo blanco, boton verde redondeado, footer con nota de
// baja), pero con contenido totalmente definido por el admin.
function buildCampaignEmailHtml(args: {
  ownerName: string;
  subject: string;
  bodyText: string;
  imageUrl: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
}): string {
  const ownerName = escapeHtml(args.ownerName);
  const subject = escapeHtml(args.subject);
  const logoUrl = escapeHtml(EMAIL_LOGO_URL);
  const bodyHtml = textToHtmlParagraphs(args.bodyText);
  const imageUrl = args.imageUrl ? escapeHtml(args.imageUrl) : '';
  const buttonText = args.buttonText ? escapeHtml(args.buttonText) : '';
  const buttonUrl = args.buttonUrl ? escapeHtml(args.buttonUrl) : '';
  const showButton = Boolean(buttonText && buttonUrl);

  return `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3fbf6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3fbf6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #d1fae5;">
            <tr>
              <td style="background:linear-gradient(135deg,#10b981,#059669);padding:20px 24px;color:#ffffff;">
                <img src="${logoUrl}" alt="AiPetFriendly" width="140" style="display:block;max-width:140px;height:auto;margin-bottom:12px;" />
                <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:800;">${subject}</h1>
                <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#dcfce7;">Hola ${ownerName}, tenemos novedades para vos en AiPetFriendly.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                ${imageUrl ? `<img src="${imageUrl}" alt="${subject}" style="width:100%;height:auto;border-radius:14px;display:block;margin:0 0 16px;border:1px solid #e2e8f0;" />` : ''}
                ${bodyHtml}
                ${showButton ? `<div style="margin-top:14px;text-align:center;"><a href="${buttonUrl}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;">${buttonText}</a></div>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">Recibís este correo porque aceptaste recibir novedades de AiPetFriendly. Podés desactivarlo cuando quieras desde "Mi Cuenta" dentro de la app.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject,
      html,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend error: ${JSON.stringify(payload)}`);
  }

  return payload as { id?: string };
}

async function fetchOptedInUsers(): Promise<OptedInUserRow[]> {
  const users: OptedInUserRow[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('news_opt_in', true)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`fetchOptedInUsers query failed: ${error.message ?? JSON.stringify(error)}`);
    }

    const rows = (data ?? []) as OptedInUserRow[];
    users.push(...rows);

    if (rows.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  return users;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const incomingKey = req.headers.get('x-news-campaigns-key');
    if (!NEWS_CAMPAIGNS_API_KEY || incomingKey !== NEWS_CAMPAIGNS_API_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: dueCampaigns, error: dueError } = await supabase
      .from('news_campaigns')
      .select('id, subject, body_text, image_url, button_text, button_url')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString());

    if (dueError) {
      throw new Error(`news_campaigns query failed: ${dueError.message ?? JSON.stringify(dueError)}`);
    }

    const campaigns = (dueCampaigns ?? []) as CampaignRow[];

    if (campaigns.length === 0) {
      return new Response(JSON.stringify({ campaignsSent: [], message: 'No hay campanias pendientes de envio.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const campaignsSent: Array<{ id: string; usersEmailed: number; failed: number }> = [];

    for (const campaign of campaigns) {
      // Marca como "sending" primero para que una segunda ejecucion casi simultanea
      // (cron cada 15 minutos) no la tome de nuevo mientras se esta procesando.
      const { data: claimed } = await supabase
        .from('news_campaigns')
        .update({ status: 'sending' })
        .eq('id', campaign.id)
        .eq('status', 'scheduled')
        .select('id');

      if (!claimed || claimed.length === 0) {
        continue;
      }

      try {
        const optedInUsers = await fetchOptedInUsers();
        let sent = 0;
        let failed = 0;

        for (const user of optedInUsers) {
          const ownerName = user.full_name?.trim() || deriveNameFromEmail(user.email);
          try {
            await sendEmail(
              user.email,
              campaign.subject,
              buildCampaignEmailHtml({
                ownerName,
                subject: campaign.subject,
                bodyText: campaign.body_text,
                imageUrl: campaign.image_url,
                buttonText: campaign.button_text,
                buttonUrl: campaign.button_url,
              }),
            );
            sent += 1;
          } catch (error) {
            failed += 1;
            console.error(`Error enviando campania "${campaign.id}" a ${user.email}:`, error);
          }
        }

        await supabase
          .from('news_campaigns')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            users_notified: sent,
            error_message: failed > 0 ? `Fallaron ${failed} de ${optedInUsers.length} envios.` : null,
          })
          .eq('id', campaign.id);

        campaignsSent.push({ id: campaign.id, usersEmailed: sent, failed });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`Error procesando campania "${campaign.id}":`, reason);
        await supabase
          .from('news_campaigns')
          .update({ status: 'failed', error_message: reason })
          .eq('id', campaign.id);
      }
    }

    return new Response(JSON.stringify({ campaignsSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('send-news-campaigns error:', reason);
    return new Response(JSON.stringify({ error: reason }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
