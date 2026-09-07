// Avisa por email al administrador cuando una veterinaria o un lugar pet
// friendly sugerido junta las validaciones necesarias (validations_goal).
// El cliente primero llama al RPC claim_*_admin_notification (que marca
// admin_notified_at de forma atomica) y solo si esa llamada "gana" la carrera
// invoca esta funcion, para evitar mandar el email mas de una vez.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'AiPetFriendly <onboarding@resend.dev>';
const ADMIN_NOTIFICATION_EMAIL = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseAuth = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !supabaseAuth) {
      return jsonResponse(401, { error: 'Missing Authorization header' });
    }

    const jwt = authHeader.replace('Bearer ', '').trim();
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(jwt);
    if (authError || !authData.user) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    const body = await req.json().catch(() => ({}));
    const entityType = body?.entityType === 'veterinary' || body?.entityType === 'place' ? body.entityType : null;
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 200) : '';
    const zoneLabel = typeof body?.zoneLabel === 'string' ? body.zoneLabel.trim().slice(0, 200) : '';
    const address = typeof body?.address === 'string' ? body.address.trim().slice(0, 300) : '';
    const upvotesCount = Number.isFinite(body?.upvotesCount) ? Number(body.upvotesCount) : null;
    const validationsGoal = Number.isFinite(body?.validationsGoal) ? Number(body.validationsGoal) : null;
    const claimUrl = typeof body?.claimUrl === 'string' ? body.claimUrl.trim().slice(0, 500) : '';

    if (!entityType || !name) {
      return jsonResponse(400, { error: 'entityType y name son requeridos' });
    }

    if (!RESEND_API_KEY || !ADMIN_NOTIFICATION_EMAIL) {
      console.error('Missing RESEND_API_KEY or ADMIN_NOTIFICATION_EMAIL, skipping admin email');
      return jsonResponse(200, { sent: false, reason: 'missing_email_config' });
    }

    const entityLabel = entityType === 'veterinary' ? 'Veterinaria' : 'Lugar pet friendly';
    const subject = `AiPetFriendly - ${entityLabel} lista para activar: ${name}`;
    const html = `
      <h2>${escapeHtml(entityLabel)} junto las validaciones necesarias</h2>
      <p><strong>Nombre:</strong> ${escapeHtml(name)}</p>
      ${zoneLabel ? `<p><strong>Zona:</strong> ${escapeHtml(zoneLabel)}</p>` : ''}
      ${address ? `<p><strong>Direccion:</strong> ${escapeHtml(address)}</p>` : ''}
      ${upvotesCount !== null && validationsGoal !== null ? `<p><strong>Validaciones:</strong> ${upvotesCount}/${validationsGoal}</p>` : ''}
      ${claimUrl ? `<p><strong>Enlace de claim:</strong> <a href="${escapeHtml(claimUrl)}">${escapeHtml(claimUrl)}</a></p>` : ''}
      <p style="color:#64748b;font-size:12px;margin-top:16px;">Este aviso se envia una sola vez por registro.</p>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [ADMIN_NOTIFICATION_EMAIL],
        subject,
        html,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Resend error:', payload);
      return jsonResponse(200, { sent: false, reason: 'resend_error' });
    }

    return jsonResponse(200, { sent: true });
  } catch (error) {
    console.error('notify-admin-threshold error:', error);
    return jsonResponse(500, { error: 'Internal error' });
  }
});
