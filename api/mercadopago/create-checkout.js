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

export default async function handler(req, res) {
  if (!ensureMethod(req, res, 'POST')) {
    return;
  }

  try {
    const payload = await readBody(req);
    const planCode = payload?.planCode === 'monthly_manual' ? 'monthly_manual' : 'monthly_manual';
    const countryCode = normalizeCountryCode(payload?.countryCode);

    const {
      user,
      admin,
    } = await getAuthenticatedContext(req);
    const pricing = await getBillingPricingSettings(admin);
    const monthlyAmount = Number(pricing.premiumMonthlyManualArs || 9900);

    const appBaseUrl = getAppBaseUrl().replace(/\/$/, '');
    const notificationUrl = getWebhookNotificationUrl();

    if (!isArgentinaCountry(countryCode)) {
      const amountUsd = Number(pricing.premiumMonthlyManualUsd || 9.9);
      const usdCheckout = await createUsdGatewaySession({
        mode: 'one_time',
        planCode,
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
        mode: 'one_time',
        planCode,
        status: 'pending',
        providerPaymentId: null,
        externalReference: user.id,
        payerEmail: user.email,
        amount: amountUsd,
        currency: 'USD',
        metadata: {
          pricingArsReference: monthlyAmount,
          pricingUsd: amountUsd,
          checkoutProvider: process.env.USD_GATEWAY_PROVIDER || 'stripe',
          providerReference: usdCheckout.providerReference,
          checkout: usdCheckout.raw,
        },
      });

      return sendJson(res, 200, {
        initPoint: usdCheckout.initPoint,
        mode: 'one_time',
        planCode,
      });
    }

    const preferencePayload = {
      external_reference: user.id,
      notification_url: notificationUrl,
      back_urls: {
        success: `${appBaseUrl}/?payment=success`,
        failure: `${appBaseUrl}/?payment=failure`,
        pending: `${appBaseUrl}/?payment=pending`,
      },
      auto_return: 'approved',
      payer: {
        email: user.email,
      },
      statement_descriptor: 'AIPETFRIENDLY',
      payment_methods: {
        excluded_payment_types: [
          { id: 'ticket' },
          { id: 'atm' },
        ],
      },
      items: [
        {
          id: 'aipetfriendly-premium-monthly-manual',
          title: 'AiPetFriendly Premium mensual (pago manual)',
          description: 'Acceso Premium por 30 dias con renovacion manual.',
          quantity: 1,
          currency_id: 'ARS',
          unit_price: monthlyAmount,
        },
      ],
    };

    const preference = await mpRequest('/checkout/preferences', 'POST', preferencePayload);
    const initPoint = preference?.init_point || preference?.sandbox_init_point;

    if (!initPoint) {
      return sendJson(res, 502, { error: 'Mercado Pago no devolvio URL de checkout para pago mensual.' });
    }

    await upsertBillingRecord(admin, {
      userId: user.id,
      mode: 'one_time',
      planCode,
      status: 'pending',
      providerPaymentId: null,
      externalReference: user.id,
      payerEmail: user.email,
      amount: monthlyAmount,
      currency: 'ARS',
      metadata: {
        settlementCountry: countryCode,
        pricingArs: monthlyAmount,
        pricingUsd: pricing.premiumMonthlyManualUsd,
        preferenceId: preference?.id || null,
        checkout: preference,
      },
    });

    return sendJson(res, 200, {
      initPoint,
      mode: 'one_time',
      planCode,
    });
  } catch (error) {
    console.error('create-checkout error:', error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'No se pudo crear el pago mensual.',
    });
  }
}
