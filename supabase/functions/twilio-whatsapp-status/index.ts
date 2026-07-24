import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const REMINDERS_API_KEY = Deno.env.get('REMINDERS_API_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-reminders-key',
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type NotificationStatus = 'accepted' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'undelivered' | 'failed';

function mapTwilioStatus(status: string | null): NotificationStatus {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'queued') return 'queued';
  if (normalized === 'accepted') return 'accepted';
  if (normalized === 'sending') return 'sending';
  if (normalized === 'sent') return 'sent';
  if (normalized === 'delivered') return 'delivered';
  if (normalized === 'read') return 'read';
  if (normalized === 'undelivered') return 'undelivered';
  if (normalized === 'failed') return 'failed';
  return 'accepted';
}

async function updateLogByMessageId(messageSid: string, status: NotificationStatus, payload: Record<string, string>) {
  const update: Record<string, unknown> = {
    status,
    provider_status: payload.MessageStatus || status,
    provider_response: payload,
    last_status_at: new Date().toISOString(),
  };

  if (status === 'delivered' || status === 'read') {
    update.delivered_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('notification_logs')
    .update(update)
    .eq('provider_message_id', messageSid)
    .eq('channel', 'whatsapp');

  if (error) {
    throw error;
  }
}

async function updateVeterinaryLogByMessageId(messageSid: string, status: NotificationStatus, payload: Record<string, string>) {
  const update: Record<string, unknown> = {
    status,
    provider_status: payload.MessageStatus || status,
    provider_response: payload,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('veterinary_notification_logs')
    .update(update)
    .eq('provider_message_id', messageSid)
    .eq('channel', 'whatsapp');

  if (error) {
    throw error;
  }
}

async function fetchTwilioMessageStatus(messageSid: string) {
  const basicAuth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages/${messageSid}.json`,
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Twilio status error: ${JSON.stringify(payload)}`);
  }

  return payload as Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method === 'POST') {
      const bodyText = await req.text();
      const form = new URLSearchParams(bodyText);
      const payload = Object.fromEntries(form.entries());

      if (!payload.AccountSid || payload.AccountSid !== TWILIO_ACCOUNT_SID) {
        return new Response(JSON.stringify({ error: 'Unauthorized Twilio account' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!payload.MessageSid) {
        return new Response(JSON.stringify({ error: 'Missing MessageSid' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const mappedStatus = mapTwilioStatus(payload.MessageStatus ?? null);
      await updateLogByMessageId(payload.MessageSid, mappedStatus, payload);
      await updateVeterinaryLogByMessageId(payload.MessageSid, mappedStatus, payload);

      return new Response(JSON.stringify({ ok: true, messageSid: payload.MessageSid, status: mappedStatus }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'GET') {
      const incomingKey = req.headers.get('x-reminders-key');
      if (!REMINDERS_API_KEY || incomingKey !== REMINDERS_API_KEY) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const url = new URL(req.url);
      const sid = url.searchParams.get('sid')?.trim();
      if (!sid) {
        return new Response(JSON.stringify({ error: 'Missing sid query param' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const payload = await fetchTwilioMessageStatus(sid);
      return new Response(JSON.stringify({ ok: true, sid, twilio: payload }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
