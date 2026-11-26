import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const discord = 'https://discord.com/api/v10';
const sessionAge = 3600;
const stateAge = 300;

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function issue(kind, value, age, secret) {
  const body = Buffer.from(JSON.stringify({ kind, value, expires: Date.now() + age * 1000 })).toString('base64url');
  return body + '.' + sign(body, secret);
}

function verify(token, kind, secret) {
  if (!token) return null;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url'));
    return data.kind === kind && data.expires > Date.now() ? data.value : null;
  } catch {
    return null;
  }
}

function send(response, status, title, message, link) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ember Veil · ${title}</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 60% 0%,#3b201e,transparent 62%),#111013;color:#faf4f2;font:16px system-ui,sans-serif}
main{width:min(100%,510px);padding:clamp(26px,6vw,54px);border:1px solid #493034;border-top:3px solid #ff795f;border-radius:4px;background:#191518;box-shadow:0 24px 80px #0008}strong{color:#ff795f;letter-spacing:.12em}
h1{font-size:clamp(1.8rem,6vw,2.6rem);line-height:1.03}p{color:#c3b5b5}a{display:inline-block;margin-top:12px;padding:12px 20px;border-radius:8px;background:#ff795f;color:#171016;font-weight:700;text-decoration:none}
</style><main><strong>EMBER VEIL</strong><h1>${title}</h1><p>${message}</p>${link || ''}</main></html>`);
}

export function discordLogin(env, requestDiscord = fetch) {
  const { DISCORD_CLIENT_ID: clientId, DISCORD_CLIENT_SECRET: secret, DISCORD_GUILD_ID: guildId } = env;
  const origin = new URL(env.PUBLIC_URL || 'http://127.0.0.1:' + (env.PORT || 3000));
  const callback = new URL('/auth/discord/callback', origin).href;
  const cookie = (name, value, age) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${origin.protocol === 'https:' ? '; Secure' : ''}`;
  const retry = '<a href="/auth/discord">Entrar com Discord</a>';
  const redirect = (response, location, cookies) => {
    response.writeHead(303, { Location: location, 'Set-Cookie': cookies });
    response.end();
  };

  return async (request, response) => {
    const url = new URL(request.url, origin);
    const path = url.pathname;
    if (path === '/staff' && request.method === 'POST') {
      const cookies = Object.fromEntries((request.headers.cookie || '').split(';').map(part => part.trim().split('=')));
      const userId = secret && verify(cookies.ember_session, 'session', secret);
      if (userId && request.headers.origin === origin.origin) return userId;
      response.writeHead(403).end('Acesso negado.');
      return false;
    }
    if (request.method !== 'GET' || !['/', '/auth/discord', '/auth/discord/callback', '/sair'].includes(path)) {
      response.writeHead(404).end();
      return false;
    }
    if (path === '/') {
      const session = (request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('ember_session='));
      return secret && verify(session?.slice('ember_session='.length), 'session', secret) || 'public';
    }
    if (!clientId || !secret || !guildId) {
      send(response, 503, 'Painel em configuração', 'O acesso com Discord estará disponível em breve.');
      return false;
    }

    const cookies = Object.fromEntries((request.headers.cookie || '').split(';').map(part => part.trim().split('=')));
    if (path === '/sair') {
      redirect(response, '/', [cookie('ember_session', '', 0)]);
      return false;
    }
    if (path === '/auth/discord') {
      const state = randomBytes(24).toString('base64url');
      const authorize = new URL('https://discord.com/oauth2/authorize');
      authorize.search = new URLSearchParams({
        client_id: clientId, response_type: 'code', redirect_uri: callback,
        scope: 'guilds.members.read', state
      }).toString();
      redirect(response, authorize.href, [cookie('ember_state', issue('state', state, stateAge, secret), stateAge)]);
      return false;
    }

    response.setHeader('Set-Cookie', cookie('ember_state', '', 0));
    const state = verify(cookies.ember_state, 'state', secret);
    const code = url.searchParams.get('code');
    if (!state || state !== url.searchParams.get('state') || !code) {
      send(response, 400, 'Login não concluído', 'Inicie o login novamente pelo painel.', retry);
      return false;
    }
    const grant = await requestDiscord(discord + '/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId, client_secret: secret, code,
        redirect_uri: callback, grant_type: 'authorization_code'
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!grant.ok) {
      send(response, 502, 'Login indisponível', 'O Discord não confirmou o login. Tente novamente.', retry);
      return false;
    }
    const token = await grant.json();
    const member = await requestDiscord(discord + '/users/@me/guilds/' + encodeURIComponent(guildId) + '/member', {
      headers: { Authorization: 'Bearer ' + token.access_token },
      signal: AbortSignal.timeout(10000)
    });
    if (member.status === 403 || member.status === 404) {
      send(response, 403, 'Acesso restrito', 'Entre no servidor da Ember Veil para acessar o painel.', retry);
      return false;
    }
    if (!member.ok) throw new Error('Discord membership check failed');
    const profile = await member.json();
    if (!profile.user?.id) throw new Error('Discord membership response has no user ID');
    redirect(response, '/', [
      cookie('ember_state', '', 0),
      cookie('ember_session', issue('session', profile.user.id, sessionAge, secret), sessionAge)
    ]);
    return false;
  };
}
