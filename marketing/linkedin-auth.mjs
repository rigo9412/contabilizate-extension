// Conecta tu perfil de LinkedIn y guarda LINKEDIN_TOKEN y LINKEDIN_PERSON_ID en marketing/.env.
//
//   node --env-file=marketing/.env marketing/linkedin-auth.mjs
//
// Requiere LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET en marketing/.env, y que la app
// tenga http://localhost:8787/callback como "Authorized redirect URL".
// El token dura 60 días; cuando caduque, vuelve a correr este script.
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { exec } from 'node:child_process';

const ENV_FILE = new URL('./.env', import.meta.url);
const PORT = 8787;
const REDIRECT = `http://localhost:${PORT}/callback`;
const { LINKEDIN_CLIENT_ID: clientId, LINKEDIN_CLIENT_SECRET: clientSecret } = process.env;

if (!clientId || !clientSecret) {
  console.error('Faltan LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET en marketing/.env');
  process.exit(1);
}

async function saveEnv(values) {
  try {
    await access(ENV_FILE);
  } catch {
    await copyFile(new URL('./.env.example', import.meta.url), ENV_FILE);
  }
  let text = await readFile(ENV_FILE, 'utf8');
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  }
  await writeFile(ENV_FILE, text);
}

const state = randomBytes(16).toString('hex');
const authUrl = 'https://www.linkedin.com/oauth/v2/authorization?' + new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: REDIRECT,
  state,
  scope: 'openid profile w_member_social',
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (url.pathname !== '/callback') return res.writeHead(404).end();
  const finish = (msg, ok) => {
    res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<p style="font-family:sans-serif">${msg}</p>`);
    console[ok ? 'log' : 'error'](msg);
    server.close();
    if (!ok) process.exitCode = 1;
  };
  if (url.searchParams.get('state') !== state) return finish('Estado inválido; vuelve a intentarlo.', false);
  if (url.searchParams.get('error')) return finish(`LinkedIn respondió: ${url.searchParams.get('error_description')}`, false);
  try {
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: url.searchParams.get('code'),
        redirect_uri: REDIRECT,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(JSON.stringify(token));
    const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const me = await meRes.json();
    if (!meRes.ok) throw new Error(JSON.stringify(me));
    await saveEnv({ LINKEDIN_TOKEN: token.access_token, LINKEDIN_PERSON_ID: me.sub });
    const expires = new Date(Date.now() + token.expires_in * 1000).toLocaleDateString('es-MX');
    finish(`✅ LinkedIn conectado como ${me.name}. El token vence el ${expires}. Ya puedes cerrar esta pestaña.`, true);
  } catch (err) {
    finish(`No se pudo conectar: ${err.message}`, false);
  }
});

server.listen(PORT, () => {
  console.log(`Abriendo LinkedIn para autorizar...\nSi no se abre, entra a:\n${authUrl}\n`);
  exec(`open "${authUrl}"`);
});
