const ALLOWED_DESTINATIONS = new Set([
  'suivi',
  'avis',
  'administration',
  'demande',
]);
const encoder = new TextEncoder();

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function readCookie(request, name) {
  const cookies = request.headers.get('cookie') || '';
  const match = cookies
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));

  return match?.slice(name.length + 1);
}

function requestOrigin(request) {
  return new URL(request.url).origin;
}

function toBase64Url(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return toBase64Url(
    await crypto.subtle.sign('HMAC', key, encoder.encode(value)),
  );
}

async function makeSession(data, env) {
  if (!env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET_MISSING');
  }

  const payload = toBase64Url(encoder.encode(JSON.stringify(data)));
  return `${payload}.${await sign(payload, env.SESSION_SECRET)}`;
}

export async function onRequestGet({ request, env }) {
  const incomingUrl = new URL(request.url);
  const expectedState = readCookie(request, 'cshop_oauth_state');

  if (!expectedState || incomingUrl.searchParams.get('state') !== expectedState) {
    return new Response(
      'Connexion refusée : vérification de sécurité invalide.',
      { status: 400 },
    );
  }

  const body = new URLSearchParams({
    code: incomingUrl.searchParams.get('code') || '',
    client_id: env.GOOGLE_CLIENT_ID || '',
    client_secret: env.GOOGLE_CLIENT_SECRET || '',
    redirect_uri: `${requestOrigin(request)}/api/auth/google/callback`,
    grant_type: 'authorization_code',
  });
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body,
  });
  const token = await tokenResponse.json();

  if (!token.access_token) {
    return new Response('Connexion Google impossible.', { status: 400 });
  }

  const profileResponse = await fetch(
    'https://openidconnect.googleapis.com/v1/userinfo',
    { headers: { authorization: `Bearer ${token.access_token}` } },
  );
  const profile = await profileResponse.json();

  if (!profile.email_verified) {
    return new Response('E-mail Google non vérifié.', { status: 403 });
  }

  const sessionValue = await makeSession(
    {
      email: profile.email,
      name: profile.name || profile.email,
    },
    env,
  );
  const requestedDestination = readCookie(request, 'cshop_oauth_next');
  const destination = ALLOWED_DESTINATIONS.has(requestedDestination)
    ? `/?page=${requestedDestination}`
    : '/';
  const headers = new Headers({ location: destination });

  headers.append(
    'set-cookie',
    cookie('cshop_session', sessionValue, 60 * 60 * 24 * 14),
  );
  headers.append(
    'set-cookie',
    'cshop_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
  );
  headers.append(
    'set-cookie',
    'cshop_oauth_next=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
  );

  return new Response(null, { status: 302, headers });
}
