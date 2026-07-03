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

export default async function handler(req, res) {
  if (!ensureMethod(req, res, 'POST')) {
    return;
  }

  try {
    const payload = await readBody(req);
    const planCode = payload?.planCode === 'monthly_manual' ? 'monthly_manual' : 'monthly_manual';
    const monthlyAmount = Number(process.env.MP_MONTHLY_AMOUNT_ARS || 9900);

    const {
      user,
      admin,
    } = await getAuthenticatedContext(req);

    const appBaseUrl = getAppBaseUrl().replace(/\/$/, '');
    const notificationUrl = getWebhookNotificationUrl();

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
