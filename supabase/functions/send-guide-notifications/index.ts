import { createClient } from '@supabase/supabase-js';

interface GuideFeedItem {
  slug: string;
  title: string;
  category: string;
  summary: string;
  effectiveReleaseDate: string;
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
const GUIDE_NOTIFICATIONS_API_KEY = Deno.env.get('GUIDE_NOTIFICATIONS_API_KEY') ?? '';
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

const CATEGORY_LABELS: Record<string, string> = {
  adiestramiento: 'Adiestramiento',
  ansiedad: 'Ansiedad y estrés',
  conducta: 'Conducta',
  salud: 'Salud y cuidados',
};

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function buildGuideEmailHtml(args: {
  ownerName: string;
  guideTitle: string;
  guideSummary: string;
  categoryLabel: string;
  guideUrl: string;
}): string {
  const ownerName = escapeHtml(args.ownerName);
  const guideTitle = escapeHtml(args.guideTitle);
  const guideSummary = escapeHtml(args.guideSummary);
  const categoryLabel = escapeHtml(args.categoryLabel);
  const guideUrl = escapeHtml(args.guideUrl);
  const logoUrl = escapeHtml(EMAIL_LOGO_URL);

  return `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nueva guía en AiPetFriendly</title>
  </head>
  <body style="margin:0;padding:0;background:#f3fbf6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3fbf6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #d1fae5;">
            <tr>
              <td style="background:linear-gradient(135deg,#10b981,#059669);padding:20px 24px;color:#ffffff;">
                <img src="${logoUrl}" alt="AiPetFriendly" width="140" style="display:block;max-width:140px;height:auto;margin-bottom:12px;" />
                <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:800;">Subimos una guía nueva</h1>
                <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#dcfce7;">Hola ${ownerName}, hay contenido nuevo en AiPetFriendly que puede servirte.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#059669;">${categoryLabel}</p>
                <h2 style="margin:0 0 10px;font-size:19px;line-height:1.35;color:#0f172a;">${guideTitle}</h2>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${guideSummary}</p>
                <div style="margin-top:22px;text-align:center;">
                  <a href="${guideUrl}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;">Leer la guía</a>
                </div>
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
    const incomingKey = req.headers.get('x-guide-notifications-key');
    if (!GUIDE_NOTIFICATIONS_API_KEY || incomingKey !== GUIDE_NOTIFICATIONS_API_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const feedResponse = await fetch(`${WEB_APP_URL}/guides-feed.json`, { cache: 'no-store' });
    if (!feedResponse.ok) {
      throw new Error(`No se pudo obtener guides-feed.json (status ${feedResponse.status})`);
    }
    const feed = (await feedResponse.json()) as GuideFeedItem[];

    const { data: notifiedRows, error: notifiedError } = await supabase
      .from('notified_guides')
      .select('slug');
    if (notifiedError) {
      throw new Error(`notified_guides query failed: ${notifiedError.message ?? JSON.stringify(notifiedError)}`);
    }
    const notifiedSlugs = new Set((notifiedRows ?? []).map((row) => row.slug as string));

    const pendingGuides = feed.filter((guide) => !notifiedSlugs.has(guide.slug));

    if (pendingGuides.length === 0) {
      return new Response(JSON.stringify({ guidesNotified: [], usersEmailed: 0, message: 'No hay guias nuevas para notificar.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const optedInUsers = await fetchOptedInUsers();

    const guidesNotified: Array<{ slug: string; usersEmailed: number; failed: number }> = [];
    let totalEmailed = 0;

    for (const guide of pendingGuides) {
      const guideUrl = `${WEB_APP_URL}/guias/${guide.slug}`;
      const categoryLabel = CATEGORY_LABELS[guide.category] ?? guide.category;
      let sent = 0;
      let failed = 0;

      for (const user of optedInUsers) {
        const ownerName = user.full_name?.trim() || deriveNameFromEmail(user.email);
        try {
          await sendEmail(
            user.email,
            `Nueva guía en AiPetFriendly: ${guide.title}`,
            buildGuideEmailHtml({
              ownerName,
              guideTitle: guide.title,
              guideSummary: guide.summary,
              categoryLabel,
              guideUrl,
            }),
          );
          sent += 1;
        } catch (error) {
          failed += 1;
          console.error(`Error enviando email de guia "${guide.slug}" a ${user.email}:`, error);
        }
      }

      const { error: upsertError } = await supabase
        .from('notified_guides')
        .upsert({ slug: guide.slug, notified_at: new Date().toISOString(), users_notified: sent }, { onConflict: 'slug' });
      if (upsertError) {
        console.error(`Error guardando notified_guides para "${guide.slug}":`, upsertError);
      }

      guidesNotified.push({ slug: guide.slug, usersEmailed: sent, failed });
      totalEmailed += sent;
    }

    return new Response(JSON.stringify({ guidesNotified, usersEmailed: totalEmailed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('send-guide-notifications error:', reason);
    return new Response(JSON.stringify({ error: reason }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
