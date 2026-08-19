import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'AiPetFriendly <onboarding@resend.dev>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '').trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing Authorization token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminRow } = await admin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!adminRow) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { inboundEmailId, body: replyBody } = await req.json();

    if (!inboundEmailId || !replyBody || !String(replyBody).trim()) {
      return new Response(JSON.stringify({ error: 'inboundEmailId y body son requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: original, error: originalError } = await admin
      .from('inbound_emails')
      .select('id, from_address, subject, message_id')
      .eq('id', inboundEmailId)
      .single();

    if (originalError || !original) {
      return new Response(JSON.stringify({ error: 'Correo original no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: previousReplies } = await admin
      .from('inbound_email_replies')
      .select('resend_message_id')
      .eq('inbound_email_id', inboundEmailId)
      .order('created_at', { ascending: true });

    const references = [
      ...(previousReplies || []).map((r) => r.resend_message_id).filter(Boolean),
      original.message_id,
    ].filter(Boolean) as string[];

    const subject = original.subject && /^re:/i.test(original.subject)
      ? original.subject
      : `Re: ${original.subject || 'Tu consulta a AiPetFriendly'}`;

    const html = String(replyBody).trim().split('\n').map((line: string) => `<p>${line}</p>`).join('');

    const sendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [original.from_address],
        subject,
        html,
        headers: {
          'In-Reply-To': original.message_id || undefined,
          References: references.length ? references.join(' ') : undefined,
        },
      }),
    });

    const sendPayload = await sendResponse.json().catch(() => ({}));
    if (!sendResponse.ok) {
      throw new Error(`Resend error: ${JSON.stringify(sendPayload)}`);
    }

    const nowIso = new Date().toISOString();

    const { error: insertError } = await admin.from('inbound_email_replies').insert({
      inbound_email_id: inboundEmailId,
      admin_user_id: user.id,
      body: replyBody,
      resend_message_id: sendPayload.id ? `<${sendPayload.id}@resend.dev>` : null,
    });
    if (insertError) throw insertError;

    const { error: updateError } = await admin
      .from('inbound_emails')
      .update({ replied_at: nowIso, is_read: true })
      .eq('id', inboundEmailId);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('admin-reply-inbound-email error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
