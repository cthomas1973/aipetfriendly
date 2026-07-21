import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '';
const TWILIO_STATUS_CALLBACK_URL = `${SUPABASE_URL}/functions/v1/twilio-whatsapp-status`;
const WEB_APP_URL = (Deno.env.get('APP_BASE_URL') ?? 'https://aipetfriendly.vercel.app').replace(/\/$/, '');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type VeterinaryRow = {
  id: string;
  name: string;
  zone_label: string;
  address: string;
  phone_whatsapp: string | null;
  upvotes_count: number;
  validations_goal: number;
  claim_token: string | null;
  claimed_by_owner_id: string | null;
  consent_requested_at: string | null;
  consent_whatsapp_sent_at: string | null;
  status: string;
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const supabaseAuth = SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return `whatsapp:+${digits}`;
}

function buildClaimUrl(claimToken: string) {
  const claimUrl = new URL(WEB_APP_URL);
  claimUrl.searchParams.set('tab', 'map');
  claimUrl.searchParams.set('vet_claim', claimToken);
  return claimUrl.toString();
}

function buildMessage(vet: VeterinaryRow, claimUrl: string) {
  return [
    `Hola ${vet.name}.`,
    'Te escribe el equipo de AiPetFriendly.',
    `Mas de ${vet.upvotes_count} usuarios de ${vet.zone_label} solicitaron que tu veterinaria aparezca en la app.`,
    `Datos sugeridos: ${vet.name} | ${vet.address}${vet.phone_whatsapp ? ` | WhatsApp ${vet.phone_whatsapp}` : ''}.`,
    'Desde este enlace puedes dar consentimiento, negarlo, corregir datos, suscribirte a Premium y ampliar la informacion de tu perfil:',
    claimUrl,
  ].join(' ');
}

async function sendWhatsApp(to: string, body: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    throw new Error('Missing Twilio WhatsApp env vars');
  }

  const form = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: to,
    Body: body,
    StatusCallback: TWILIO_STATUS_CALLBACK_URL,
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

  return payload as { sid?: string; status?: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!supabaseAuth) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_ANON_KEY in function env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwt = authHeader.replace('Bearer ', '').trim();
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(jwt);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const veterinaryId = typeof body?.veterinaryId === 'string' ? body.veterinaryId.trim() : '';

    if (!veterinaryId) {
      return new Response(JSON.stringify({ error: 'veterinaryId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: vet, error: vetError } = await supabase
      .from('veterinary_profiles')
      .select('id,name,zone_label,address,phone_whatsapp,upvotes_count,validations_goal,claim_token,claimed_by_owner_id,consent_requested_at,consent_whatsapp_sent_at,status')
      .eq('id', veterinaryId)
      .maybeSingle<VeterinaryRow>();

    if (vetError || !vet) {
      return new Response(JSON.stringify({ sent: false, reason: 'veterinary_not_found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (vet.claimed_by_owner_id) {
      return new Response(JSON.stringify({ sent: false, reason: 'already_claimed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (vet.upvotes_count <= 5 || vet.upvotes_count < vet.validations_goal) {
      return new Response(JSON.stringify({ sent: false, reason: 'not_enough_backing' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!vet.phone_whatsapp) {
      return new Response(JSON.stringify({ sent: false, reason: 'missing_whatsapp' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!vet.claim_token) {
      return new Response(JSON.stringify({ sent: false, reason: 'missing_claim_token' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (vet.consent_whatsapp_sent_at) {
      return new Response(JSON.stringify({ sent: false, reason: 'already_sent' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!vet.consent_requested_at || vet.status === 'IN_INCUBATOR') {
      const { error: preUpdateError } = await supabase
        .from('veterinary_profiles')
        .update({
          status: 'CLAIMABLE_PROFILE',
          consent_requested_at: vet.consent_requested_at ?? new Date().toISOString(),
        })
        .eq('id', vet.id);

      if (preUpdateError) {
        throw preUpdateError;
      }
    }

    const claimUrl = buildClaimUrl(vet.claim_token);
    const message = buildMessage(vet, claimUrl);
    const normalizedTo = normalizePhone(vet.phone_whatsapp);
    const twilioResponse = await sendWhatsApp(normalizedTo, message);

    const nowIso = new Date().toISOString();

    const { error: markSentError } = await supabase
      .from('veterinary_profiles')
      .update({
        consent_whatsapp_sent_at: nowIso,
        consent_whatsapp_last_error: null,
      })
      .eq('id', vet.id);

    if (markSentError) {
      console.error('mark sent error', markSentError);
    }

    const { error: logError } = await supabase
      .from('veterinary_notification_logs')
      .insert({
        veterinary_id: vet.id,
        channel: 'whatsapp',
        target: vet.phone_whatsapp,
        status: 'queued',
        provider_message_id: twilioResponse.sid ?? null,
        provider_status: twilioResponse.status ?? 'queued',
        provider_response: {
          type: 'veterinary_consent_invite',
          veterinary_id: vet.id,
          upvotes_count: vet.upvotes_count,
          claim_url: claimUrl,
        },
        updated_at: nowIso,
      });

    if (logError) {
      console.error('notification log error', logError);
    }

    return new Response(JSON.stringify({ sent: true, veterinaryId: vet.id, upvotes: vet.upvotes_count }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error('send-veterinary-consent-whatsapp error:', message);

    const body = await req.clone().json().catch(() => ({}));
    const veterinaryId = typeof body?.veterinaryId === 'string' ? body.veterinaryId.trim() : '';
    if (veterinaryId) {
      const { error: updateError } = await supabase
        .from('veterinary_profiles')
        .update({ consent_whatsapp_last_error: message })
        .eq('id', veterinaryId);
      if (updateError) {
        console.error('consent_whatsapp_last_error update failed', updateError);
      }
    }

    return new Response(JSON.stringify({ sent: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
