import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { generatePipelineCover, runEditorialGeneration } from '../api/cron/_blog-editorial-pipeline.js';

const local = loadEnv('production', process.cwd(), '');
for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL', 'AI_IMAGE_MODEL', 'BLOG_IMAGE_MODEL']) {
  if (!process.env[name] && local[name]) process.env[name] = local[name];
}
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const command = process.argv[2] || 'status';
if (command === 'retry') {
  if (!process.argv[3]) throw new Error('Indicar UUID de la corrida retenida');
  const { data, error } = await admin.rpc('retry_retained_blog_generation', { p_run_id: process.argv[3] });
  if (error) throw new Error(error.message);
  console.log(JSON.stringify({ retryRequested: data, previousRunPreserved: process.argv[3] }));
} else if (command === 'configure') {
  const secret = process.env.BLOG_GENERATION_SECRET;
  if (!secret || secret === '[SENSITIVE]') throw new Error('Falta la credencial real del pipeline');
  const { data, error } = await admin.rpc('configure_blog_generation_schedule', { p_secret: secret });
  if (error) throw new Error(error.message);
  console.log(JSON.stringify({ jobId: data, intervalHours: 36, pulse: 'Cada minuto; genera solo si es elegible' }));
} else if (command === 'advance') {
  const result = await runEditorialGeneration(admin, { origin: 'authorized_manual_same_pipeline', generateCover: generatePipelineCover });
  console.log(JSON.stringify(result));
} else if (command === 'run') {
  const results = await Promise.all([
    runEditorialGeneration(admin, { origin: 'authorized_manual_same_pipeline', generateCover: generatePipelineCover }),
    runEditorialGeneration(admin, { origin: 'concurrency_probe', generateCover: generatePipelineCover }),
  ]);
  console.log(JSON.stringify({ concurrencyResults: results.map(({ runId, stage, skipped }) => ({ runId, stage, skipped })) }));
  let result = results.find((entry) => !entry.skipped);
  for (let step = 0; result && !['complete', 'retained'].includes(result.stage) && step < 4; step += 1) {
    result = await runEditorialGeneration(admin, { origin: 'authorized_manual_same_pipeline', generateCover: generatePipelineCover });
    console.log(JSON.stringify(result));
    if (result.skipped) break;
  }
} else if (command !== 'status') throw new Error('Usar status, configure, advance, run o retry');

const { data, error } = await admin.rpc('blog_generation_schedule_status');
if (error) throw new Error(error.message);
const latest = data.latest_run;
console.log(JSON.stringify({ state: data.state, job: data.job, ticks: data.last_ticks,
  latestRun: latest ? { id: latest.id, stage: latest.stage, error: latest.error, attempts: latest.attempts,
    title: latest.payload?.title, quality: latest.payload?.quality, cover: latest.payload?.cover_url,
    infographic: latest.payload?.infographic_url, createdAt: latest.created_at, completedAt: latest.completed_at } : null }));