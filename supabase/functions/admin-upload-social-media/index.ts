// Sube la imagen/video de una publicacion programada (panel Admin > Publicaciones)
// al bucket "social-posts-media" (publico, se crea solo si todavia no existe, igual
// que blog-images/chat-images/place-images). Requiere JWT de un usuario en admin_users
// (mismo criterio que admin-reply-inbound-email).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BUCKET = 'social-posts-media';
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);
const MAX_FILE_BYTES = 45 * 1024 * 1024; // suficiente para clips cortos.

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extensionFromMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/webm') return 'webm';
  return 'mp4';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace('Bearer ', '').trim();
  if (!jwt) {
    return jsonResponse(401, { error: 'missing_authorization' });
  }

  const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !user) {
    return jsonResponse(401, { error: 'invalid_token' });
  }

  const { data: adminRow } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) {
    return jsonResponse(403, { error: 'not_authorized' });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse(400, { error: 'invalid_form_data' });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return jsonResponse(400, { error: 'invalid_file' });
  }

  const mime = file.type.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return jsonResponse(400, { error: 'unsupported_file_type' });
  }

  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return jsonResponse(400, { error: 'invalid_file' });
  }

  try {
    const mediaType = mime.startsWith('video/') ? 'video' : 'image';
    const fileName = `${crypto.randomUUID()}.${extensionFromMime(mime)}`;

    // Se sube el binario crudo (sin pasar por base64): decodificar base64 a
    // mano (atob + Uint8Array.from con callback por caracter) es lo que
    // agotaba los recursos del worker con archivos de video de varios MB.
    let { error: uploadError } = await admin.storage.from(BUCKET).upload(fileName, file, {
      contentType: mime,
    });

    if (uploadError && /Bucket not found/i.test(uploadError.message || '')) {
      const { error: createBucketError } = await admin.storage.createBucket(BUCKET, { public: true });
      if (createBucketError && !/already exists/i.test(createBucketError.message || '')) {
        console.error('No se pudo crear el bucket social-posts-media:', createBucketError.message);
        return jsonResponse(500, { error: 'bucket_create_failed' });
      }
      const retry = await admin.storage.from(BUCKET).upload(fileName, file, { contentType: mime });
      uploadError = retry.error;
    }

    if (uploadError) {
      console.error('Error subiendo archivo de publicacion a Storage:', uploadError.message);
      return jsonResponse(500, { error: 'upload_failed' });
    }

    const { data: publicUrlData } = admin.storage.from(BUCKET).getPublicUrl(fileName);
    const mediaUrl = publicUrlData?.publicUrl;
    if (!mediaUrl) {
      return jsonResponse(500, { error: 'public_url_failed' });
    }

    return jsonResponse(200, { mediaUrl, mediaType });
  } catch (error) {
    console.error('Error inesperado subiendo archivo de publicacion:', error);
    return jsonResponse(500, { error: 'unexpected_error' });
  }
});
