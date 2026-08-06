import { origin } from '../_lib.js';

const ALLOWED_DESTINATIONS = new Set([
  'suivi',
  'avis',
  'administration',
  'demande',
]);

export async function onRequestGet({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID) {
    return new Response('Configuration Google manquante.', { status: 500 });
  }

  const requestUrl = new URL(request.url);
  const requestedDestination = requestUrl.searchParams.get('next');

  const destination = ALLOWED_DESTINATIONS.has(requestedDestination)
    ? requestedDestination
    : 'accueil';

  const state = crypto.randomUUID();

  const googleUrl = new URL(
    'https://accounts.google.com/o/oauth2/v2/auth',
  );

  googleUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  googleUrl.searchParams.set(
    'redirect_uri',
    `${origin(request)}/api/auth/google/callback`,
  );
  googleUrl.searchParams.set('response_type', 'code');
  googleUrl.searchParams.set('scope', 'openid email profile');
  googleUrl.searchParams.set('state', state);

  const headers = new Headers({
    location: googleUrl.toString(),
  });

  headers.append(
    'set-cookie',
    `cshop_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  );

  headers.append(
    'set-cookie',
    `cshop_oauth_next=${destination}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  );

  return new Response(null, { status: 302, headers });
}
