import {
  applyDiscountToAmount,
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
  registerDiscountCodeUsage,
  resolveDiscountCode,
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

function buildMpPreapprovalPayload(args) {
  const payload = {
    reason: `AiPetFriendly ${args.plan.title}`,
    external_reference: args.user.id,
    payer_email: args.user.email,
    back_url: `${args.appBaseUrl}/?payment=mercadopago`,
    notification_url: args.notificationUrl,
    auto_recurring: {
      frequency: args.plan.frequency,
      frequency_type: args.plan.frequencyType,
      transaction_amount: args.plan.amount,
      currency_id: 'ARS',
    },
    status: 'pending',
  };

  if (args.includeProviderPlanId && args.plan.providerPlanId) {
    payload.preapproval_plan_id = args.plan.providerPlanId;
  }

  return payload;
}

function resolveErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object') {
    const candidate = error;
    const parts = [
      typeof candidate.message === 'string' ? candidate.message : '',
      typeof candidate.error === 'string' ? candidate.error : '',
      typeof candidate.details === 'string' ? candidate.details : '',
      typeof candidate.hint === 'string' ? candidate.hint : '',
      typeof candidate.code === 'string' ? `code=${candidate.code}` : '',
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(' | ');
    }

    try {
      return JSON.stringify(candidate).slice(0, 400);
    } catch {
      return '[object error]';
    }
  }

  return 'unknown';
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
    const discount = await resolveDiscountCode(admin, payload?.discountCode);

    if (discount) {
      plan.amount = applyDiscountToAmount(plan.amount, discount.percentOff);
    }

    const appBaseUrl = getAppBaseUrl().replace(/\/$/, '');
    const notificationUrl = getWebhookNotificationUrl();

    if (!isArgentinaCountry(countryCode)) {
      let amountUsd = resolveUsdAmount(selectedPlanCode, pricing);
      if (discount) {
        amountUsd = applyDiscountToAmount(amountUsd, discount.percentOff);
      }
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
          discountCode: discount?.code || null,
          discountPercentOff: discount?.percentOff || null,
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
          discountCode: discount?.code || null,
          discountPercentOff: discount?.percentOff || null,
          checkout: usdCheckout.raw,
        },
      });

      if (discount) {
        await registerDiscountCodeUsage(admin, discount.code);
      }

      return sendJson(res, 200, {
        initPoint: usdCheckout.initPoint,
        mode: 'recurring',
        planCode: plan.planCode,
      });
    }

    let preapproval;
    let fallbackWithoutPlanId = false;

    try {
      // Si hay un codigo de descuento aplicado, el preapproval_plan_id de MP (con un
      // monto fijo configurado en el dashboard) ignoraria nuestro transaction_amount
      // personalizado: directamente NO se intenta usar el plan fijo en ese caso.
      const withPlanPayload = buildMpPreapprovalPayload({
        plan,
        user,
        appBaseUrl,
        notificationUrl,
        includeProviderPlanId: !discount,
      });
      preapproval = await mpRequest('/preapproval', 'POST', withPlanPayload);
    } catch (errorWithPlanId) {
      if (!plan.providerPlanId || discount) {
        throw errorWithPlanId;
      }

      try {
        const withoutPlanPayload = buildMpPreapprovalPayload({
          plan,
          user,
          appBaseUrl,
          notificationUrl,
          includeProviderPlanId: false,
        });
        preapproval = await mpRequest('/preapproval', 'POST', withoutPlanPayload);
        fallbackWithoutPlanId = true;
      } catch (errorWithoutPlanId) {
        const withPlanMessage = resolveErrorMessage(errorWithPlanId);
        const withoutPlanMessage = resolveErrorMessage(errorWithoutPlanId);
        throw new Error(
          `No se pudo crear la suscripcion automatica. MP con plan: ${withPlanMessage}. MP sin plan: ${withoutPlanMessage}`,
        );
      }
    }

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
      providerPlanId: preapproval?.preapproval_plan_id || (discount ? null : plan.providerPlanId),
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
        fallbackWithoutPlanId,
        discountCode: discount?.code || null,
        discountPercentOff: discount?.percentOff || null,
        checkout: preapproval,
      },
    });

    if (discount) {
      await registerDiscountCodeUsage(admin, discount.code);
    }

    return sendJson(res, 200, {
      initPoint,
      mode: 'recurring',
      planCode: plan.planCode,
    });
  } catch (error) {
    console.error('create-subscription error:', error);
    return sendJson(res, 500, {
      error: resolveErrorMessage(error) || 'No se pudo crear la suscripcion.',
    });
  }
}
