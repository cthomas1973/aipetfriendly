import { createClient } from '@supabase/supabase-js';

const MP_API_BASE_URL = process.env.MP_API_BASE_URL || 'https://api.mercadopago.com';

export function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

export function ensureMethod(req, res, method) {
  if (req.method !== method) {
    sendJson(res, 405, { error: 'Method not allowed' });
    return false;
  }
  return true;
}

export function getEnvOrThrow(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getAppBaseUrl() {
  return process.env.APP_BASE_URL || 'http://localhost:5173';
}

export function getWebhookNotificationUrl() {
  const appBaseUrl = getAppBaseUrl().replace(/\/$/, '');
  const webhookKey = process.env.MP_WEBHOOK_KEY || '';
  if (!webhookKey) {
    return `${appBaseUrl}/api/mercadopago/webhook`;
  }

  return `${appBaseUrl}/api/mercadopago/webhook?webhook_key=${encodeURIComponent(webhookKey)}`;
}

export async function readBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}

export function getSupabaseAdminClient() {
  const supabaseUrl = getEnvOrThrow('SUPABASE_URL');
  const serviceRoleKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function getAuthenticatedContext(req) {
  const supabaseUrl = getEnvOrThrow('SUPABASE_URL');
  const anonKey = getEnvOrThrow('VITE_SUPABASE_ANON_KEY');
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    throw new Error('Missing Authorization token');
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user) {
    throw new Error('Invalid or expired auth token');
  }

  const admin = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('id, email')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('User profile not found. Complete signup first.');
  }

  return {
    user: profile,
    admin,
  };
}

export async function mpRequest(path, method = 'GET', body) {
  const token = getEnvOrThrow('MP_ACCESS_TOKEN');
  const response = await fetch(`${MP_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Mercado Pago API error (${response.status})`);
  }

  return payload;
}

export async function upsertSubscriptionState(admin, userId, args) {
  const expiresAt = args.expiresAt || null;
  const { error: subscriptionError } = await admin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan: args.isActive ? 'premium' : 'free',
        is_active: args.isActive,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (subscriptionError) {
    throw subscriptionError;
  }

  const { error: userError } = await admin
    .from('users')
    .update({
      access_mode: args.isActive ? 'premium' : 'free',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (userError) {
    throw userError;
  }
}

export async function upsertBillingRecord(admin, payload) {
  const record = {
    user_id: payload.userId,
    provider: 'mercadopago',
    mode: payload.mode,
    plan_code: payload.planCode,
    status: payload.status,
    provider_preapproval_id: payload.providerPreapprovalId || null,
    provider_payment_id: payload.providerPaymentId || null,
    provider_plan_id: payload.providerPlanId || null,
    external_reference: payload.externalReference || null,
    payer_email: payload.payerEmail || null,
    amount: payload.amount ?? null,
    currency: payload.currency || 'ARS',
    current_period_start: payload.currentPeriodStart || null,
    current_period_end: payload.currentPeriodEnd || null,
    last_event_at: new Date().toISOString(),
    metadata: payload.metadata || null,
    updated_at: new Date().toISOString(),
  };

  if (payload.providerPreapprovalId) {
    const { error } = await admin
      .from('payment_subscriptions')
      .upsert(record, { onConflict: 'provider_preapproval_id' });

    if (error) {
      throw error;
    }
    return;
  }

  if (payload.providerPaymentId) {
    const { error } = await admin
      .from('payment_subscriptions')
      .upsert(record, { onConflict: 'provider_payment_id' });

    if (error) {
      throw error;
    }
    return;
  }

  const { error } = await admin
    .from('payment_subscriptions')
    .insert([record]);

  if (error) {
    throw error;
  }
}

export async function markWebhookEvent(admin, args) {
  const { error } = await admin
    .from('payment_webhook_events')
    .insert([
      {
        provider: 'mercadopago',
        event_id: args.eventId,
        event_type: args.eventType,
        payload: args.payload,
      },
    ]);

  if (error) {
    if (String(error.code) === '23505') {
      return { duplicate: true };
    }
    throw error;
  }

  return { duplicate: false };
}

export async function finalizeWebhookEvent(admin, eventId) {
  await admin
    .from('payment_webhook_events')
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
    })
    .eq('provider', 'mercadopago')
    .eq('event_id', eventId);
}

export function addDaysIso(baseDateIso, days) {
  const base = new Date(baseDateIso || new Date().toISOString());
  base.setDate(base.getDate() + days);
  return base.toISOString();
}
