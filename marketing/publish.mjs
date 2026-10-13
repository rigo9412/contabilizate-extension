// Publica los posts aprobados de marketing/queue.json en X, LinkedIn, Threads y Facebook
// usando las APIs oficiales.
//
//   node --env-file=marketing/.env marketing/publish.mjs          # simulacro: muestra qué publicaría
//   node --env-file=marketing/.env marketing/publish.mjs --send   # publica de verdad
//
// Solo se publica un post si tiene "approved": true, si su fecha "at" ya pasó
// y si todavía no tiene "postedAt". El resultado se guarda en queue.json.
import { readFile, writeFile } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';

const QUEUE = new URL('./queue.json', import.meta.url);
const SEND = process.argv.includes('--send');
const env = process.env;

function need(...keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Faltan variables en marketing/.env: ${missing.join(', ')}`);
}

async function call(url, init) {
  const res = await fetch(url, init);
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${url}\n${body}`);
  return { res, json: body ? JSON.parse(body) : {} };
}

// ---------- X (OAuth 1.0a, contexto de usuario) ----------

const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function xAuthHeader(method, url) {
  const oauth = {
    oauth_consumer_key: env.X_API_KEY,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: env.X_ACCESS_TOKEN,
    oauth_version: '1.0',
  };
  // El cuerpo JSON no entra en la firma; solo los parámetros oauth_*.
  const params = Object.keys(oauth).sort().map((k) => `${pct(k)}=${pct(oauth[k])}`).join('&');
  const base = [method, pct(url), pct(params)].join('&');
  const key = `${pct(env.X_API_SECRET)}&${pct(env.X_ACCESS_SECRET)}`;
  oauth.oauth_signature = createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.keys(oauth).map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(', ');
}

async function postX(post) {
  need('X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET');
  const url = 'https://api.x.com/2/tweets';
  const parts = Array.isArray(post.text) ? post.text : [post.text];
  const ids = [];
  for (const text of parts) {
    const body = { text };
    if (ids.length) body.reply = { in_reply_to_tweet_id: ids.at(-1) };
    const { json } = await call(url, {
      method: 'POST',
      headers: { Authorization: xAuthHeader('POST', url), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    ids.push(json.data.id);
  }
  return ids;
}

// ---------- LinkedIn (perfil personal, producto "Share on LinkedIn") ----------

// LinkedIn publica una versión de API al mes y retira las de hace más de un año.
function linkedinVersion() {
  if (env.LINKEDIN_VERSION) return env.LINKEDIN_VERSION;
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// El campo commentary usa "little text": estos caracteres se escapan para que salgan literales.
const littleText = (s) => s.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => '\\' + c);

async function postLinkedIn(post) {
  need('LINKEDIN_TOKEN', 'LINKEDIN_PERSON_ID');
  const text = Array.isArray(post.text) ? post.text.join('\n\n') : post.text;
  const { res } = await call('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.LINKEDIN_TOKEN}`,
      'LinkedIn-Version': linkedinVersion(),
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      author: `urn:li:person:${env.LINKEDIN_PERSON_ID}`,
      commentary: littleText(text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });
  return [res.headers.get('x-restli-id')];
}

// ---------- Threads (Meta) ----------

async function postThreads(post) {
  need('THREADS_TOKEN');
  const api = 'https://graph.threads.net/v1.0/me';
  const parts = Array.isArray(post.text) ? post.text : [post.text];
  const ids = [];
  for (const [i, text] of parts.entries()) {
    const params = new URLSearchParams({ text, access_token: env.THREADS_TOKEN });
    if (i === 0 && post.image) {
      params.set('media_type', 'IMAGE');
      params.set('image_url', post.image);
    } else {
      params.set('media_type', 'TEXT');
    }
    if (ids.length) params.set('reply_to_id', ids.at(-1));
    const { json: container } = await call(`${api}/threads?${params}`, { method: 'POST' });
    // Meta recomienda esperar a que el contenedor se procese, sobre todo con imagen.
    await new Promise((r) => setTimeout(r, post.image && i === 0 ? 30_000 : 3_000));
    const publish = new URLSearchParams({ creation_id: container.id, access_token: env.THREADS_TOKEN });
    const { json } = await call(`${api}/threads_publish?${publish}`, { method: 'POST' });
    ids.push(json.id);
  }
  return ids;
}

// ---------- Facebook (página; la API no permite perfil personal ni grupos) ----------

async function postFacebook(post) {
  need('FB_PAGE_ID', 'FB_PAGE_TOKEN');
  const api = `https://graph.facebook.com/${env.FB_GRAPH_VERSION || 'v24.0'}/${env.FB_PAGE_ID}`;
  const text = Array.isArray(post.text) ? post.text.join('\n\n') : post.text;
  const params = new URLSearchParams({ access_token: env.FB_PAGE_TOKEN });
  let endpoint = 'feed';
  if (post.image) {
    endpoint = 'photos';
    params.set('url', post.image);
    params.set('caption', text);
  } else {
    params.set('message', text);
  }
  const { json } = await call(`${api}/${endpoint}`, { method: 'POST', body: params });
  return [json.post_id || json.id];
}

// ---------- Cola ----------

const publishers = { x: postX, linkedin: postLinkedIn, threads: postThreads, facebook: postFacebook };

const queue = JSON.parse(await readFile(QUEUE, 'utf8'));
const now = Date.now();
const due = queue.posts.filter((p) => p.approved && !p.postedAt && new Date(p.at).getTime() <= now);

if (!due.length) console.log('No hay posts aprobados pendientes para esta hora.');

for (const post of due) {
  const publish = publishers[post.network];
  if (!publish) {
    console.warn(`[${post.id}] Red "${post.network}" no soportada; se publica a mano.`);
    continue;
  }
  if (!SEND) {
    console.log(`[simulacro] ${post.network} · ${post.id}\n${[].concat(post.text).join('\n---\n')}\n`);
    continue;
  }
  try {
    post.postIds = await publish(post);
    post.postedAt = new Date().toISOString();
    delete post.error;
    console.log(`✅ ${post.network} · ${post.id} → ${post.postIds.join(', ')}`);
  } catch (err) {
    post.error = String(err.message).slice(0, 500);
    console.error(`❌ ${post.network} · ${post.id}\n${err.message}`);
  }
  // Se guarda después de cada post para no duplicar si algo falla a la mitad.
  await writeFile(QUEUE, JSON.stringify(queue, null, 2) + '\n');
}
