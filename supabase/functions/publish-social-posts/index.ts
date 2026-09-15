// supabase/functions/publish-social-posts/index.ts
//
// Etapa 1 de "Publicaciones" (Admin > Publicaciones): publica de verdad en
// Facebook e Instagram los posts que ya quedaron en status='scheduled' con
// scheduled_at vencido. YouTube/TikTok todavia no estan soportados (quedan
// marcados como 'failed' con un mensaje claro) - se suman en una etapa
// posterior.
//
// Se dispara por un cron externo (GitHub Actions, ver
// .github/workflows/publish-social-posts.yml) cada 15 minutos, autenticado
// con un header custom (mismo patron que send-blog-post-notifications).
//
// Requiere estos secrets (npx supabase secrets set ... --project-ref <ref>):
//   PUBLISH_SOCIAL_POSTS_API_KEY — clave compartida con el workflow de GitHub
//   META_PAGE_ID                 — ID de la Pagina de Facebook
//   META_PAGE_ACCESS_TOKEN       — Access Token (idealmente de larga duracion)
//                                   de esa Pagina, con permisos
//                                   pages_manage_posts + instagram_content_publish
//   META_IG_BUSINESS_ACCOUNT_ID  — ID de la cuenta de Instagram Business/Creator
//                                   vinculada a esa Pagina
// Opcional: META_GRAPH_API_VERSION (default "v21.0").

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
const PUBLISH_SOCIAL_POSTS_API_KEY = Deno.env.get('PUBLISH_SOCIAL_POSTS_API_KEY')?.trim() ?? '';
const META_PAGE_ID = Deno.env.get('META_PAGE_ID')?.trim() ?? '';
const META_PAGE_ACCESS_TOKEN = Deno.env.get('META_PAGE_ACCESS_TOKEN')?.trim() ?? '';
const META_IG_BUSINESS_ACCOUNT_ID = Deno.env.get('META_IG_BUSINESS_ACCOUNT_ID')?.trim() ?? '';
const META_GRAPH_API_VERSION = Deno.env.get('META_GRAPH_API_VERSION')?.trim() || 'v21.0';
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type MediaType = 'image' | 'video';
type Platform = 'facebook' | 'instagram' | 'youtube' | 'tiktok';

interface SocialPostRow {
  id: string;
  media_url: string;
  media_type: MediaType;
  caption: string | null;
}

interface SocialPostTargetRow {
  id: string;
  post_id: string;
  platform: Platform;
}

function nowIso() {
  return new Date().toISOString();
}

async function publishToFacebookPage(args: { mediaUrl: string; mediaType: MediaType; caption: string }): Promise<string> {
  if (!META_PAGE_ID || !META_PAGE_ACCESS_TOKEN) {
    throw new Error('Facebook no esta configurado (falta META_PAGE_ID / META_PAGE_ACCESS_TOKEN).');
  }

  const endpoint = args.mediaType === 'video' ? 'videos' : 'photos';
  const body = new URLSearchParams({ access_token: META_PAGE_ACCESS_TOKEN });
  if (args.mediaType === 'video') {
    body.set('file_url', args.mediaUrl);
    body.set('description', args.caption);
  } else {
    body.set('url', args.mediaUrl);
    body.set('caption', args.caption);
  }

  const res = await fetch(`${META_GRAPH_BASE_URL}/${META_PAGE_ID}/${endpoint}`, { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Facebook: ${data?.error?.message || `HTTP ${res.status}`}`);
  }
  return String(data.post_id || data.id);
}

// El flujo de publicacion en Instagram requiere 2 pasos: crear un
// "contenedor" de media y despues publicarlo por separado.
async function publishToInstagram(args: { mediaUrl: string; mediaType: MediaType; caption: string }): Promise<string> {
  if (!META_IG_BUSINESS_ACCOUNT_ID || !META_PAGE_ACCESS_TOKEN) {
    throw new Error('Instagram no esta configurado (falta META_IG_BUSINESS_ACCOUNT_ID / META_PAGE_ACCESS_TOKEN).');
  }
  if (args.mediaType !== 'image') {
    throw new Error('Instagram: por ahora solo se soporta publicar imagenes (no video).');
  }

  const createBody = new URLSearchParams({
    image_url: args.mediaUrl,
    caption: args.caption,
    access_token: META_PAGE_ACCESS_TOKEN,
  });
  const createRes = await fetch(`${META_GRAPH_BASE_URL}/${META_IG_BUSINESS_ACCOUNT_ID}/media`, {
    method: 'POST',
    body: createBody,
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !createData.id) {
    throw new Error(`Instagram (crear contenedor): ${createData?.error?.message || `HTTP ${createRes.status}`}`);
  }

  // El contenedor tarda un poco en procesarse (descarga/valida la imagen) antes
  // de poder publicarse. Sin esto, media_publish puede fallar con "Media ID
  // is not available" si se llama demasiado rapido.
  await waitForContainerReady(createData.id);

  const publishBody = new URLSearchParams({
    creation_id: createData.id,
    access_token: META_PAGE_ACCESS_TOKEN,
  });
  const publishRes = await fetch(`${META_GRAPH_BASE_URL}/${META_IG_BUSINESS_ACCOUNT_ID}/media_publish`, {
    method: 'POST',
    body: publishBody,
  });
  const publishData = await publishRes.json().catch(() => ({}));
  if (!publishRes.ok || !publishData.id) {
    throw new Error(`Instagram (publicar): ${publishData?.error?.message || `HTTP ${publishRes.status}`}`);
  }
  return String(publishData.id);
}

async function waitForContainerReady(containerId: string): Promise<void> {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const statusRes = await fetch(
      `${META_GRAPH_BASE_URL}/${containerId}?fields=status_code&access_token=${encodeURIComponent(META_PAGE_ACCESS_TOKEN)}`,
    );
    const statusData = await statusRes.json().catch(() => ({}));
    if (!statusRes.ok) {
      throw new Error(`Instagram (estado del contenedor): ${statusData?.error?.message || `HTTP ${statusRes.status}`}`);
    }
    if (statusData.status_code === 'FINISHED') return;
    if (statusData.status_code === 'ERROR') {
      throw new Error('Instagram (contenedor): el procesamiento del media termino en error.');
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Instagram (contenedor): tardo demasiado en procesarse (timeout).');
}

async function publishTarget(post: SocialPostRow, target: SocialPostTargetRow): Promise<string> {
  const caption = post.caption || '';
  if (target.platform === 'facebook') {
    return publishToFacebookPage({ mediaUrl: post.media_url, mediaType: post.media_type, caption });
  }
  if (target.platform === 'instagram') {
    return publishToInstagram({ mediaUrl: post.media_url, mediaType: post.media_type, caption });
  }
  throw new Error(`La plataforma "${target.platform}" todavia no esta soportada (queda pendiente para una etapa posterior).`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const incomingKey = req.headers.get('x-publish-social-posts-key');
    if (!PUBLISH_SOCIAL_POSTS_API_KEY || incomingKey !== PUBLISH_SOCIAL_POSTS_API_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: duePosts, error: duePostsError } = await supabase
      .from('social_posts')
      .select('id, media_url, media_type, caption')
      .eq('status', 'scheduled')
      .lte('scheduled_at', nowIso())
      .order('scheduled_at', { ascending: true })
      .limit(10);
    if (duePostsError) {
      throw new Error(`social_posts query failed: ${duePostsError.message}`);
    }

    const results: Array<{ postId: string; status: string; error?: string }> = [];

    for (const post of (duePosts ?? []) as SocialPostRow[]) {
      // Reserva atomica: si otra corrida ya lo tomo, el status ya no es
      // 'scheduled' y este update no afecta ninguna fila.
      const { data: claimed } = await supabase
        .from('social_posts')
        .update({ status: 'processing', updated_at: nowIso() })
        .eq('id', post.id)
        .eq('status', 'scheduled')
        .select('id')
        .maybeSingle();
      if (!claimed) {
        continue;
      }

      try {
        const { data: targets, error: targetsError } = await supabase
          .from('social_post_targets')
          .select('id, post_id, platform')
          .eq('post_id', post.id)
          .eq('status', 'pending');
        if (targetsError) {
          throw new Error(`social_post_targets query failed: ${targetsError.message}`);
        }

        for (const target of (targets ?? []) as SocialPostTargetRow[]) {
          await supabase
            .from('social_post_targets')
            .update({ status: 'processing', updated_at: nowIso() })
            .eq('id', target.id);

          try {
            const externalPostId = await publishTarget(post, target);
            await supabase
              .from('social_post_targets')
              .update({
                status: 'published',
                external_post_id: externalPostId,
                error: null,
                published_at: nowIso(),
                updated_at: nowIso(),
              })
              .eq('id', target.id);
          } catch (targetError) {
            const message = targetError instanceof Error ? targetError.message : String(targetError);
            console.error(`Error publicando post ${post.id} en ${target.platform}:`, message);
            await supabase
              .from('social_post_targets')
              .update({ status: 'failed', error: message, updated_at: nowIso() })
              .eq('id', target.id);
          }
        }

        await supabase.from('social_posts').update({ status: 'done', updated_at: nowIso() }).eq('id', post.id);
        results.push({ postId: post.id, status: 'done' });
      } catch (postError) {
        // Fallo antes de poder intentar publicar en las redes (ej. no se
        // pudieron leer los targets): se libera el post para reintentar en
        // la proxima corrida del cron, en vez de dejarlo trabado en 'processing'.
        const message = postError instanceof Error ? postError.message : String(postError);
        console.error(`Error procesando post ${post.id}, se reintentara:`, message);
        await supabase.from('social_posts').update({ status: 'scheduled', updated_at: nowIso() }).eq('id', post.id);
        results.push({ postId: post.id, status: 'error', error: message });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error en publish-social-posts:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
