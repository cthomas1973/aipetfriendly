import {
  ensureMethod,
  getAppBaseUrl,
  getAuthenticatedContext,
  getWebhookNotificationUrl,
  mpRequest,
  readBody,
  sendJson,
  upsertBillingRecord,
} from './_shared.js';

function resolvePlan(planCode) {
  const monthlyAmount = Number(process.env.MP_MONTHLY_AMOUNT_ARS || 9900);
  const annualAmount = Number(process.env.MP_ANNUAL_AMOUNT_ARS || 99900);

  if (planCode === 'annual') {
    return {
      planCode: 'annual',
      title: 'Premium anual',
      frequency: 12,
      frequencyType: 'months',
      amount: annualAmount,
      providerPlanId: process.env.MP_PLAN_ANNUAL_ID || null,
    };
  }

  return {
    planCode: 'monthly',
    title: 'Premium mensual',
    frequency: 1,
    frequencyType: 'months',
    amount: monthlyAmount,
    providerPlanId: process.env.MP_PLAN_MONTHLY_ID || null,
  };
}

export default async function handler(req, res) {
  if (!ensureMethod(req, res, 'POST')) {
    return;
  }

  try {
    const payload = await readBody(req);
    const selectedPlanCode = payload?.planCode === 'annual' ? 'annual' : 'monthly';
    const plan = resolvePlan(selectedPlanCode);

    const {
      user,
      admin,
    } = await getAuthenticatedContext(req);

    const appBaseUrl = getAppBaseUrl().replace(/\/$/, '');
    const notificationUrl = getWebhookNotificationUrl();

    const mpPayload = {
      reason: `AiPetFriendly ${plan.title}`,
      external_reference: user.id,
      payer_email: user.email,
      back_url: `${appBaseUrl}/?payment=mercadopago`,
      notification_url: notificationUrl,
      auto_recurring: {
        frequency: plan.frequency,
        frequency_type: plan.frequencyType,
        transaction_amount: plan.amount,
        currency_id: 'ARS',
      },
      status: 'pending',
    };

    if (plan.providerPlanId) {
      mpPayload.preapproval_plan_id = plan.providerPlanId;
    }

    const preapproval = await mpRequest('/preapproval', 'POST', mpPayload);
    const initPoint = preapproval?.init_point || preapproval?.sandbox_init_point;

    if (!initPoint) {
      return sendJson(res, 502, { error: 'Mercado Pago no devolvio URL de checkout para suscripcion.' });
    }

    await upsertBillingRecord(admin, {
      userId: user.id,
      mode: 'recurring',
      planCode: plan.planCode,
      status: String(preapproval?.status || 'pending'),
      providerPreapprovalId: preapproval?.id,
      providerPlanId: preapproval?.preapproval_plan_id || plan.providerPlanId,
      externalReference: user.id,
      payerEmail: user.email,
      amount: plan.amount,
      currency: 'ARS',
      currentPeriodStart: preapproval?.auto_recurring?.start_date || null,
      currentPeriodEnd: preapproval?.next_payment_date || null,
      metadata: {
        checkout: preapproval,
      },
    });

    return sendJson(res, 200, {
      initPoint,
      mode: 'recurring',
      planCode: plan.planCode,
    });
  } catch (error) {
    console.error('create-subscription error:', error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'No se pudo crear la suscripcion.',
    });
  }
}
