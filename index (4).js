import { origin } from '../../../_lib.js';

export async function onRequestGet({request, env}) {
  if (!env.GOOGLE_CLIENT_ID) {
    return new Response('Configuration Google manquante.', {status: 500});
  }

  const state = crypto.randomUUID();
  const requested = new URL(request.url).searchParams.get('next');
  const next = ['suivi', 'avis', 'administration', 'demande'].includes(requested)
    ? requested
    : 'accueil';
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');

  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${origin(request)}/api/auth/google/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);

  const headers = new Headers({location: url.toString()});
  headers.append('set-cookie', `cshop_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  headers.append('set-cookie', `cshop_oauth_next=${next}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return new Response(null, {status: 302, headers});
}
