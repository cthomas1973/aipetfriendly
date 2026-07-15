import { createClient } from '@supabase/supabase-js';

interface ReminderTaskRow {
  id: string;
  title: string;
  due_date: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  pet_id: string;
}

interface PetRow {
  id: string;
  name: string;
  user_id: string;
  photo_url: string | null;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'AiPetFriendly <onboarding@resend.dev>';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '';
const TWILIO_WHATSAPP_CONTENT_SID = Deno.env.get('TWILIO_WHATSAPP_CONTENT_SID') ?? '';
const TWILIO_STATUS_CALLBACK_URL = `${SUPABASE_URL}/functions/v1/twilio-whatsapp-status`;
const WEB_APP_URL = (Deno.env.get('APP_BASE_URL') ?? 'https://aipetfriendly.vercel.app').replace(/\/$/, '');
const EMAIL_LOGO_URL = Deno.env.get('EMAIL_LOGO_URL') ?? `${WEB_APP_URL}/logo-aipetfriendly.png`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildReminderEmailHtml(args: {
  ownerName: string;
  petName: string;
  taskTitle: string;
  scheduledDate: string;
  notes: string | null;
  petPhotoUrl: string | null;
}): string {
  const ownerName = escapeHtml(args.ownerName);
  const petName = escapeHtml(args.petName);
  const taskTitle = escapeHtml(args.taskTitle);
  const date = escapeHtml(args.scheduledDate);
  const notes = args.notes ? escapeHtml(args.notes) : '';
  const petPhotoUrl = args.petPhotoUrl ? escapeHtml(args.petPhotoUrl) : '';
  const webUrl = escapeHtml(WEB_APP_URL);
  const logoUrl = escapeHtml(EMAIL_LOGO_URL);

  return `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Recordatorio AiPetFriendly</title>
  </head>
  <body style="margin:0;padding:0;background:#f3fbf6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3fbf6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #d1fae5;">
            <tr>
              <td style="background:linear-gradient(135deg,#10b981,#059669);padding:20px 24px;color:#ffffff;">
                <img src="${logoUrl}" alt="AiPetFriendly" width="140" style="display:block;max-width:140px;height:auto;margin-bottom:12px;" />
                <h1 style="margin:0;font-size:24px;line-height:1.2;font-weight:800;">Recordatorio de salud para ${petName}</h1>
                <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#dcfce7;">Hola ${ownerName}, este aviso te ayuda a mantener al dia los cuidados preventivos de tu mascota.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                ${petPhotoUrl ? `<img src="${petPhotoUrl}" alt="${petName}" style="width:100%;max-width:220px;height:auto;border-radius:14px;display:block;margin:0 auto 16px;border:1px solid #e2e8f0;" />` : ''}
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0 8px;">
                  <tr><td style="font-size:14px;color:#475569;width:110px;"><strong>Mascota</strong></td><td style="font-size:15px;color:#0f172a;">${petName}</td></tr>
                  <tr><td style="font-size:14px;color:#475569;width:110px;"><strong>Tarea</strong></td><td style="font-size:15px;color:#0f172a;">${taskTitle}</td></tr>
                  <tr><td style="font-size:14px;color:#475569;width:110px;"><strong>Fecha</strong></td><td style="font-size:15px;color:#0f172a;">${date}</td></tr>
                </table>
                ${notes ? `<div style="margin-top:10px;padding:12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;"><p style="margin:0;font-size:14px;color:#334155;"><strong>Nota:</strong> ${notes}</p></div>` : ''}
                <div style="margin-top:20px;text-align:center;">
                  <a href="${webUrl}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:999px;">Abrir AiPetFriendly</a>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">AiPetFriendly - Recordatorios preventivos. Si ya completaste esta tarea, puedes ignorar este mensaje.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function normalizeChannels(metadata: Record<string, unknown> | null) {
  const raw = metadata?.notificationChannels;
  if (!Array.isArray(raw) || raw.length === 0) {
    return ['push'];
  }

  return raw.map((value) => String(value).trim().toLowerCase());
}

function maybePhone(metadata: Record<string, unknown> | null): string | null {
  const phone = metadata?.notificationPhone;
  if (typeof phone !== 'string') {
    return null;
  }
  const trimmed = phone.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function maybeEmail(metadata: Record<string, unknown> | null): string | null {
  const email = metadata?.notificationEmail;
  if (typeof email !== 'string') {
    return null;
  }
  const trimmed = email.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function alreadySent(taskId: string, channel: 'email' | 'whatsapp', date: string) {
  const { data, error } = await supabase
    .from('notification_logs')
    .select('id')
    .eq('task_id', taskId)
    .eq('channel', channel)
    .eq('scheduled_date', date)
    .in('status', channel === 'whatsapp'
      ? ['accepted', 'queued', 'sending', 'sent', 'delivered', 'read']
      : ['sent'])
    .limit(1);

  if (error) {
    console.error('alreadySent error', error);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

async function saveLog(args: {
  taskId: string;
  channel: 'email' | 'whatsapp';
  target: string;
  scheduledDate: string;
  status: 'accepted' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'undelivered' | 'failed';
  providerMessageId?: string;
  providerStatus?: string;
  providerResponse?: unknown;
}) {
  const { error } = await supabase
    .from('notification_logs')
    .upsert(
      {
        task_id: args.taskId,
        channel: args.channel,
        target: args.target,
        scheduled_date: args.scheduledDate,
        status: args.status,
        provider_message_id: args.providerMessageId ?? null,
        provider_status: args.providerStatus ?? args.status,
        provider_response: args.providerResponse ?? null,
        delivered_at: args.status === 'delivered' || args.status === 'read' ? new Date().toISOString() : null,
        last_status_at: new Date().toISOString(),
      },
      { onConflict: 'task_id,channel,scheduled_date' },
    );

  if (error) {
    console.error('saveLog error', error);
  }
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

async function sendWhatsApp(to: string, args: { body: string; contentSid?: string; contentVariables?: Record<string, string> }) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    throw new Error('Missing Twilio WhatsApp env vars');
  }

  const normalizedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const form = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: normalizedTo,
    StatusCallback: TWILIO_STATUS_CALLBACK_URL,
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

  return payload as { sid?: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('REMINDERS_API_KEY');
    const incomingKey = req.headers.get('x-reminders-key');

    if (!apiKey || incomingKey !== apiKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const today = toIsoDate(now);

    const { data: dueTasks, error: dueError } = await supabase
      .from('preventive_tasks')
      .select('id, title, due_date, notes, metadata, pet_id')
      .lte('due_date', today)
      .eq('completed', false);

    if (dueError) {
      throw dueError;
    }

    const tasks = (dueTasks ?? []) as ReminderTaskRow[];

    let sentEmail = 0;
    let sentWhatsApp = 0;
    let failed = 0;
    const failedDetails: Array<{ taskId: string; channel: 'email' | 'whatsapp'; reason: string }> = [];

    for (const task of tasks) {
      const metadata = task.metadata ?? {};
      const remindersEnabled = metadata.remindersEnabled;
      if (remindersEnabled === false) {
        continue;
      }

      const channels = normalizeChannels(metadata);
      const wantsEmail = channels.includes('email');
      const wantsWhatsApp = channels.includes('whatsapp');
      if (!wantsEmail && !wantsWhatsApp) {
        continue;
      }

      const { data: pet, error: petError } = await supabase
        .from('pets')
        .select('id, name, user_id, photo_url')
        .eq('id', task.pet_id)
        .single();

      if (petError || !pet) {
        failed += 1;
        continue;
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('id', (pet as PetRow).user_id)
        .single();

      if (userError || !user) {
        failed += 1;
        continue;
      }

      const petName = (pet as PetRow).name;
      const petPhotoUrl = (pet as PetRow).photo_url;
      const ownerEmail = (user as UserRow).email;
      const ownerName = (user as UserRow).full_name?.trim() || 'tutor';
      const eventEmail = maybeEmail(metadata);
      const targetEmail = eventEmail ?? ownerEmail;
      const scheduledDate = task.due_date;
      const formattedDate = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${scheduledDate}T12:00:00`));

      const messageText = `Recordatorio de ${petName}: ${task.title}. Vence el ${scheduledDate}.${task.notes ? ` Nota: ${task.notes}` : ''}`;

      if (wantsEmail) {
        const skip = await alreadySent(task.id, 'email', scheduledDate);
        if (!skip) {
          try {
            const response = await sendEmail(
              targetEmail,
              `AiPetFriendly: recordatorio de ${petName}`,
              buildReminderEmailHtml({
                ownerName,
                petName,
                taskTitle: task.title,
                scheduledDate,
                notes: task.notes,
                petPhotoUrl,
              }),
            );

            await saveLog({
              taskId: task.id,
              channel: 'email',
              target: targetEmail,
              scheduledDate,
              status: 'sent',
              providerMessageId: response.id,
              providerResponse: response,
            });
            sentEmail += 1;
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            await saveLog({
              taskId: task.id,
              channel: 'email',
              target: targetEmail,
              scheduledDate,
              status: 'failed',
              providerResponse: reason,
            });
            failed += 1;
            failedDetails.push({ taskId: task.id, channel: 'email', reason });
          }
        }
      }

      if (wantsWhatsApp) {
        const phone = maybePhone(metadata);
        if (!phone) {
          failed += 1;
          failedDetails.push({ taskId: task.id, channel: 'whatsapp', reason: 'Missing notificationPhone in task metadata' });
        } else {
          const skip = await alreadySent(task.id, 'whatsapp', scheduledDate);
          if (!skip) {
            try {
              const hasApprovedTemplate = TWILIO_WHATSAPP_CONTENT_SID.trim().length > 0;
              const response = await sendWhatsApp(phone, {
                body: messageText,
                contentSid: hasApprovedTemplate ? TWILIO_WHATSAPP_CONTENT_SID : undefined,
                contentVariables: hasApprovedTemplate
                  ? {
                      '1': ownerName,
                      '2': petName,
                      '3': task.title,
                      '4': formattedDate,
                    }
                  : undefined,
              });

              await saveLog({
                taskId: task.id,
                channel: 'whatsapp',
                target: phone,
                scheduledDate,
                status: 'accepted',
                providerMessageId: response.sid,
                providerStatus: 'accepted',
                providerResponse: response,
              });
              sentWhatsApp += 1;
            } catch (error) {
              const reason = error instanceof Error ? error.message : String(error);
              await saveLog({
                taskId: task.id,
                channel: 'whatsapp',
                target: phone,
                scheduledDate,
                status: 'failed',
                providerResponse: reason,
              });
              failed += 1;
              failedDetails.push({ taskId: task.id, channel: 'whatsapp', reason });
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        totalDueTasks: tasks.length,
        sentEmail,
        sentWhatsApp,
        failed,
        failedDetails: failedDetails.slice(0, 10),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
