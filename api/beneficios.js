const GROUP_QUERIES = {
  alimentos: 'alimento mascotas',
  accesorios: 'correa collar pretal mascotas',
  higiene: 'shampoo pipeta mascotas',
  descanso: 'cucha rascador juguetes mascotas',
};

function toBool(value) {
  return value === 'true' || value === '1' || value === 'yes';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const grupo = String(req.query.grupo || 'alimentos');
    const sort = String(req.query.sort || '');
    const shipping = toBool(String(req.query.shipping || 'false'));
    const delivery = toBool(String(req.query.delivery || 'false'));
    const lat = req.query.lat ? String(req.query.lat) : '';
    const lon = req.query.lon ? String(req.query.lon) : '';
    const region = req.query.region ? String(req.query.region) : '';

    const affiliateId = process.env.ML_AFFILIATE_ID || 'aipetfriendly';
    const query = GROUP_QUERIES[grupo] || String(req.query.grupo || 'alimento mascotas');

    const meliUrl = new URL('https://api.mercadolibre.com/sites/MLA/search');
    meliUrl.searchParams.set('q', query);
    meliUrl.searchParams.set('limit', '20');

    if (sort === 'price_asc' || sort === 'price_desc') {
      meliUrl.searchParams.set('sort', sort);
    }

    // Filtro por region si el frontend no tiene coordenadas activas.
    if (region && !lat) {
      meliUrl.searchParams.set('state', region);
    }

    const response = await fetch(meliUrl.toString(), {
      headers: {
        'User-Agent': 'AiPetFriendly/1.0 (+https://www.aipetfriendly.ar)',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: 'Mercado Libre API error', details: text.slice(0, 200) });
    }

    const data = await response.json();
    const products = Array.isArray(data?.results) ? data.results : [];

    let mapped = products.map((product) => {
      const urlOriginal = product?.permalink || '';
      const linkAfiliado = `https://click.mercadolibre.com/tracking/click?id=${encodeURIComponent(affiliateId)}&redirect=${encodeURIComponent(urlOriginal)}`;

      const shippingInfo = product?.shipping || {};
      const logisticType = String(shippingInfo?.logistic_type || '').toLowerCase();
      const fastDelivery = logisticType === 'fulfillment' || logisticType === 'cross_docking';

      const originalPrice = Number(product?.original_price || 0);
      const price = Number(product?.price || 0);
      const discount = originalPrice > 0 && price > 0
        ? Math.max(0, Math.round(((originalPrice - price) / originalPrice) * 100))
        : 0;

      const thumbnail = String(product?.thumbnail || '');

      return {
        id: String(product?.id || ''),
        title: String(product?.title || 'Producto sin titulo'),
        price,
        original_price: originalPrice || null,
        discount,
        thumbnail: thumbnail.replace('-I.jpg', '-O.jpg'),
        link: linkAfiliado,
        free_shipping: Boolean(shippingInfo?.free_shipping),
        fast_delivery: fastDelivery,
        state: String(product?.address?.state_name || ''),
        seller_loc: product?.seller_address?.location || null,
      };
    });

    if (shipping) {
      mapped = mapped.filter((item) => item.free_shipping);
    }

    if (delivery) {
      mapped = mapped.filter((item) => item.fast_delivery);
    }

    // Orden fallback en servidor si Mercado Libre no lo aplico.
    if (sort === 'price_asc') {
      mapped.sort((a, b) => a.price - b.price);
    } else if (sort === 'price_desc') {
      mapped.sort((a, b) => b.price - a.price);
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ products: mapped });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al conectar con Mercado Libre',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
