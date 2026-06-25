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
}

interface UserRow {
  id: string;
  email: string;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'AiPetFriendly <onboarding@resend.dev>';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '';

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

function normalizeChannels(metadata: Record<string, unknown> | null) {
  const raw = metadata?.notificationChannels;
  if (!Array.isArray(raw) || raw.length === 0) {
    return ['Push'];
  }

  return raw.map(String);
}

function maybePhone(metadata: Record<string, unknown> | null): string | null {
  const phone = metadata?.notificationPhone;
  if (typeof phone !== 'string') {
    return null;
  }
  const trimmed = phone.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function alreadySent(taskId: string, channel: 'email' | 'whatsapp', date: string) {
  const { data, error } = await supabase
    .from('notification_logs')
    .select('id')
    .eq('task_id', taskId)
    .eq('channel', channel)
    .eq('scheduled_date', date)
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
  status: 'sent' | 'failed';
  providerMessageId?: string;
  providerResponse?: unknown;
}) {
  const { error } = await supabase.from('notification_logs').insert({
    task_id: args.taskId,
    channel: args.channel,
    target: args.target,
    scheduled_date: args.scheduledDate,
    status: args.status,
    provider_message_id: args.providerMessageId ?? null,
    provider_response: args.providerResponse ?? null,
  });

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

async function sendWhatsApp(to: string, body: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    throw new Error('Missing Twilio WhatsApp env vars');
  }

  const normalizedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const form = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: normalizedTo,
    Body: body,
  });

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

    for (const task of tasks) {
      const metadata = task.metadata ?? {};
      const remindersEnabled = metadata.remindersEnabled;
      if (remindersEnabled === false) {
        continue;
      }

      const channels = normalizeChannels(metadata);
      const wantsEmail = channels.includes('Email');
      const wantsWhatsApp = channels.includes('WhatsApp');
      if (!wantsEmail && !wantsWhatsApp) {
        continue;
      }

      const { data: pet, error: petError } = await supabase
        .from('pets')
        .select('id, name, user_id')
        .eq('id', task.pet_id)
        .single();

      if (petError || !pet) {
        failed += 1;
        continue;
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email')
        .eq('id', (pet as PetRow).user_id)
        .single();

      if (userError || !user) {
        failed += 1;
        continue;
      }

      const petName = (pet as PetRow).name;
      const ownerEmail = (user as UserRow).email;
      const scheduledDate = task.due_date;

      const messageText = `Recordatorio de ${petName}: ${task.title}. Vence el ${scheduledDate}.${task.notes ? ` Nota: ${task.notes}` : ''}`;

      if (wantsEmail) {
        const skip = await alreadySent(task.id, 'email', scheduledDate);
        if (!skip) {
          try {
            const response = await sendEmail(
              ownerEmail,
              `AiPetFriendly: recordatorio de ${petName}`,
              `<h2>Recordatorio AiPetFriendly</h2><p><strong>Mascota:</strong> ${petName}</p><p><strong>Tarea:</strong> ${task.title}</p><p><strong>Fecha:</strong> ${scheduledDate}</p><p>${task.notes ?? ''}</p>`,
            );

            await saveLog({
              taskId: task.id,
              channel: 'email',
              target: ownerEmail,
              scheduledDate,
              status: 'sent',
              providerMessageId: response.id,
              providerResponse: response,
            });
            sentEmail += 1;
          } catch (error) {
            await saveLog({
              taskId: task.id,
              channel: 'email',
              target: ownerEmail,
              scheduledDate,
              status: 'failed',
              providerResponse: String(error),
            });
            failed += 1;
          }
        }
      }

      if (wantsWhatsApp) {
        const phone = maybePhone(metadata);
        if (!phone) {
          failed += 1;
        } else {
          const skip = await alreadySent(task.id, 'whatsapp', scheduledDate);
          if (!skip) {
            try {
              const response = await sendWhatsApp(phone, messageText);

              await saveLog({
                taskId: task.id,
                channel: 'whatsapp',
                target: phone,
                scheduledDate,
                status: 'sent',
                providerMessageId: response.sid,
                providerResponse: response,
              });
              sentWhatsApp += 1;
            } catch (error) {
              await saveLog({
                taskId: task.id,
                channel: 'whatsapp',
                target: phone,
                scheduledDate,
                status: 'failed',
                providerResponse: String(error),
              });
              failed += 1;
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
