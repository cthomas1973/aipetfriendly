import {
  createUsdGatewaySession,
  ensureMethod,
  getBillingPricingSettings,
  getAppBaseUrl,
  getAuthenticatedContext,
  getWebhookNotificationUrl,
  isArgentinaCountry,
  mpRequest,
  normalizeCountryCode,
  readBody,
  sendJson,
  upsertBillingRecord,
} from './_shared.js';

function resolvePlan(planCode, pricing) {
  const monthlyAmount = Number(pricing.premiumMonthlyAutoArs || 9900);
  const annualAmount = Number(pricing.premiumAnnualAutoArs || 99900);

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

function resolveUsdAmount(planCode, pricing) {
  if (planCode === 'annual') {
    return Number(pricing.premiumAnnualAutoUsd || 99.9);
  }
  return Number(pricing.premiumMonthlyAutoUsd || 9.9);
}

export default async function handler(req, res) {
  if (!ensureMethod(req, res, 'POST')) {
    return;
  }

  try {
    const payload = await readBody(req);
    const selectedPlanCode = payload?.planCode === 'annual' ? 'annual' : 'monthly';
    const countryCode = normalizeCountryCode(payload?.countryCode);

    const {
      user,
      admin,
    } = await getAuthenticatedContext(req);
    const pricing = await getBillingPricingSettings(admin);
    const plan = resolvePlan(selectedPlanCode, pricing);

    const appBaseUrl = getAppBaseUrl().replace(/\/$/, '');
    const notificationUrl = getWebhookNotificationUrl();

    if (!isArgentinaCountry(countryCode)) {
      const amountUsd = resolveUsdAmount(selectedPlanCode, pricing);
      const usdCheckout = await createUsdGatewaySession({
        mode: 'recurring',
        planCode: selectedPlanCode,
        userId: user.id,
        email: user.email,
        amount: amountUsd,
        countryCode,
        successUrl: `${appBaseUrl}/?payment=success`,
        cancelUrl: `${appBaseUrl}/?payment=failure`,
        metadata: {
          origin: 'aipetfriendly',
          settlementCountry: countryCode,
        },
      });

      await upsertBillingRecord(admin, {
        userId: user.id,
        mode: 'recurring',
        planCode: plan.planCode,
        status: 'pending',
        externalReference: user.id,
        payerEmail: user.email,
        amount: amountUsd,
        currency: 'USD',
        metadata: {
          pricingArsReference: plan.amount,
          pricingUsd: amountUsd,
          checkoutProvider: process.env.USD_GATEWAY_PROVIDER || 'stripe',
          providerReference: usdCheckout.providerReference,
          checkout: usdCheckout.raw,
        },
      });

      return sendJson(res, 200, {
        initPoint: usdCheckout.initPoint,
        mode: 'recurring',
        planCode: plan.planCode,
      });
    }

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
        settlementCountry: countryCode,
        pricingArs: plan.amount,
        pricingUsd: plan.planCode === 'annual' ? pricing.premiumAnnualAutoUsd : pricing.premiumMonthlyAutoUsd,
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
