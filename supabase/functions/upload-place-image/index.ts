// Funcion publica (sin login) para que el dueño de un negocio suba la foto de
// su lugar durante el flujo de claim (?place_claim=<token>). No requiere sesion
// de Supabase: el token de claim en si mismo funciona como credencial (mismo
// criterio que submit_pet_friendly_place_claim_decision, que tambien acepta
// anon). Usa service role para poder escribir en Storage sin depender de RLS.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i;
const MAX_BASE64_LENGTH = 8_000_000; // ~6MB de imagen real, mismo limite que chat-images.

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function imageMimeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/[a-z]+);base64,/i);
  return match ? match[1].toLowerCase() : 'image/jpeg';
}

function imageExtensionFromMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  let body: { claimToken?: unknown; imageDataUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  const claimToken = typeof body.claimToken === 'string' ? body.claimToken.trim() : '';
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';

  if (!claimToken) {
    return jsonResponse(400, { error: 'missing_claim_token' });
  }
  if (!imageDataUrl || !IMAGE_DATA_URL_PATTERN.test(imageDataUrl) || imageDataUrl.length > MAX_BASE64_LENGTH) {
    return jsonResponse(400, { error: 'invalid_image' });
  }

  const { data: place, error: placeError } = await admin
    .from('pet_friendly_places')
    .select('id')
    .eq('claim_token', claimToken)
    .maybeSingle();

  if (placeError || !place) {
    return jsonResponse(404, { error: 'claim_token_not_found' });
  }

  try {
    const mime = imageMimeFromDataUrl(imageDataUrl);
    const base64 = imageDataUrl.slice(imageDataUrl.indexOf(',') + 1);
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const fileName = `${crypto.randomUUID()}.${imageExtensionFromMime(mime)}`;

    let { error: uploadError } = await admin.storage.from('place-images').upload(fileName, blob, {
      contentType: mime,
    });

    if (uploadError && /Bucket not found/i.test(uploadError.message || '')) {
      const { error: createBucketError } = await admin.storage.createBucket('place-images', { public: true });
      if (createBucketError && !/already exists/i.test(createBucketError.message || '')) {
        console.error('No se pudo crear el bucket place-images:', createBucketError.message);
        return jsonResponse(500, { error: 'bucket_create_failed' });
      }
      const retry = await admin.storage.from('place-images').upload(fileName, blob, { contentType: mime });
      uploadError = retry.error;
    }

    if (uploadError) {
      console.error('Error subiendo imagen de lugar a Storage:', uploadError.message);
      return jsonResponse(500, { error: 'upload_failed' });
    }

    const { data: publicUrlData } = admin.storage.from('place-images').getPublicUrl(fileName);
    const imageUrl = publicUrlData?.publicUrl;
    if (!imageUrl) {
      return jsonResponse(500, { error: 'public_url_failed' });
    }

    const { error: rpcError } = await admin.rpc('set_pet_friendly_place_image', {
      p_claim_token: claimToken,
      p_image_url: imageUrl,
    });

    if (rpcError) {
      console.error('Error guardando image_url del lugar:', rpcError.message);
      return jsonResponse(500, { error: 'save_failed' });
    }

    return jsonResponse(200, { imageUrl });
  } catch (error) {
    console.error('Error inesperado subiendo imagen de lugar:', error);
    return jsonResponse(500, { error: 'unexpected_error' });
  }
});
