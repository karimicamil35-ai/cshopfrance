const ALLOWED_DESTINATIONS = new Set([
  'suivi',
  'avis',
  'administration',
  'demande',
]);

function requestOrigin(request) {
  return new URL(request.url).origin;
}

export async function onRequestGet({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID) {
    return new Response('Configuration Google manquante.', { status: 500 });
  }

  const state = crypto.randomUUID();
  const requested = new URL(request.url).searchParams.get('next');
  const next = ALLOWED_DESTINATIONS.has(requested) ? requested : 'accueil';
  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');

  googleUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  googleUrl.searchParams.set(
    'redirect_uri',
    `${requestOrigin(request)}/api/auth/google/callback`,
  );
  googleUrl.searchParams.set('response_type', 'code');
  googleUrl.searchParams.set('scope', 'openid email profile');
  googleUrl.searchParams.set('state', state);

  const headers = new Headers({ location: googleUrl.toString() });
  headers.append(
    'set-cookie',
    `cshop_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  );
  headers.append(
    'set-cookie',
    `cshop_oauth_next=${next}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  );

  return new Response(null, { status: 302, headers });
}
