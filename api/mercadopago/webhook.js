import {
  addDaysIso,
  ensureMethod,
  finalizeWebhookEvent,
  getSupabaseAdminClient,
  markWebhookEvent,
  mpRequest,
  readBody,
  sendJson,
  upsertBillingRecord,
  upsertSubscriptionState,
} from './_shared.js';

function resolveEventType(req, body) {
  const queryType = req.query?.type || req.query?.topic;
  if (queryType) return String(queryType);
  if (body?.type) return String(body.type);
  if (body?.action) return String(body.action);
  return 'unknown';
}

function resolveResourceId(req, body) {
  const queryDataId = req.query?.['data.id'];
  if (queryDataId) return String(queryDataId);

  if (body?.data?.id) return String(body.data.id);
  if (body?.id && String(body?.type || '').includes('payment')) return String(body.id);
  if (req.query?.id) return String(req.query.id);
  return '';
}

function resolveEventId(eventType, resourceId, body) {
  if (body?.id && !String(eventType).includes('payment')) {
    return String(body.id);
  }

  const created = body?.date_created || new Date().toISOString();
  return `${eventType}:${resourceId}:${created}`;
}

async function processPaymentEvent(admin, paymentId) {
  const payment = await mpRequest(`/v1/payments/${encodeURIComponent(paymentId)}`);
  const externalReference = String(payment?.external_reference || '').trim();
  const userId = externalReference;

  if (!userId) {
    return;
  }

  const status = String(payment?.status || 'unknown');
  const approvedAt = payment?.date_approved || payment?.date_created || new Date().toISOString();
  const expiresAt = addDaysIso(approvedAt, 30);

  await upsertBillingRecord(admin, {
    userId,
    mode: 'one_time',
    planCode: 'monthly_manual',
    status,
    providerPaymentId: String(payment?.id || paymentId),
    externalReference,
    payerEmail: payment?.payer?.email || null,
    amount: Number(payment?.transaction_amount || 0),
    currency: String(payment?.currency_id || 'ARS'),
    currentPeriodStart: approvedAt,
    currentPeriodEnd: status === 'approved' ? expiresAt : null,
    metadata: {
      payment,
    },
  });

  if (status === 'approved') {
    await upsertSubscriptionState(admin, userId, {
      isActive: true,
      expiresAt,
    });
  }
}

function resolveRecurringPlanCode(preapproval) {
  const frequency = Number(preapproval?.auto_recurring?.frequency || 1);
  if (frequency >= 12) {
    return 'annual';
  }
  return 'monthly';
}

async function processPreapprovalEvent(admin, preapprovalId) {
  const preapproval = await mpRequest(`/preapproval/${encodeURIComponent(preapprovalId)}`);
  const externalReference = String(preapproval?.external_reference || '').trim();
  const userId = externalReference;

  if (!userId) {
    return;
  }

  const status = String(preapproval?.status || 'unknown');
  const isAuthorized = status === 'authorized';

  await upsertBillingRecord(admin, {
    userId,
    mode: 'recurring',
    planCode: resolveRecurringPlanCode(preapproval),
    status,
    providerPreapprovalId: String(preapproval?.id || preapprovalId),
    providerPlanId: preapproval?.preapproval_plan_id || null,
    externalReference,
    payerEmail: preapproval?.payer_email || null,
    amount: Number(preapproval?.auto_recurring?.transaction_amount || 0),
    currency: String(preapproval?.auto_recurring?.currency_id || 'ARS'),
    currentPeriodStart: preapproval?.auto_recurring?.start_date || null,
    currentPeriodEnd: preapproval?.next_payment_date || null,
    metadata: {
      preapproval,
    },
  });

  if (isAuthorized) {
    await upsertSubscriptionState(admin, userId, {
      isActive: true,
      expiresAt: null,
    });
    return;
  }

  if (status === 'cancelled' || status === 'paused') {
    await upsertSubscriptionState(admin, userId, {
      isActive: false,
      expiresAt: null,
    });
  }
}

export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method || '')) {
    return ensureMethod(req, res, 'POST');
  }

  try {
    const webhookKey = process.env.MP_WEBHOOK_KEY || '';
    if (webhookKey) {
      const incomingKey = String(req.query?.webhook_key || '');
      if (incomingKey !== webhookKey) {
        return sendJson(res, 401, { error: 'Unauthorized webhook key' });
      }
    }

    const body = await readBody(req);
    const eventType = resolveEventType(req, body);
    const resourceId = resolveResourceId(req, body);

    if (!resourceId) {
      return sendJson(res, 202, { ok: true, skipped: true, reason: 'No resource id' });
    }

    const eventId = resolveEventId(eventType, resourceId, body);
    const admin = getSupabaseAdminClient();
    const dedupe = await markWebhookEvent(admin, {
      eventId,
      eventType,
      payload: {
        query: req.query,
        body,
      },
    });

    if (dedupe.duplicate) {
      return sendJson(res, 200, { ok: true, duplicate: true });
    }

    const lowerType = eventType.toLowerCase();
    if (lowerType.includes('payment')) {
      await processPaymentEvent(admin, resourceId);
    } else if (lowerType.includes('preapproval') || lowerType.includes('subscription')) {
      await processPreapprovalEvent(admin, resourceId);
    }

    await finalizeWebhookEvent(admin, eventId);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('mercadopago webhook error:', error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Webhook processing failed',
    });
  }
}
