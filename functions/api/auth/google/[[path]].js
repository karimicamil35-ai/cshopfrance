import {cookie, makeSession, origin, readCookie} from '../../../_lib.js';

export async function onRequestGet({request, env}) {
  const incoming = new URL(request.url);
  const isCallback = incoming.pathname.endsWith('/callback');
  if (!isCallback) {
    if (!env.GOOGLE_CLIENT_ID) return new Response('Configuration Google manquante.', {status: 500});
    const state = crypto.randomUUID();
    const requested = incoming.searchParams.get('next');
    const next = ['suivi', 'avis', 'administration', 'demande'].includes(requested) ? requested : 'accueil';
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
  if (incoming.searchParams.get('state') !== readCookie(request, 'cshop_oauth_state')) return new Response('Connexion refusée : vérification de sécurité invalide.', {status: 400});
  const body = new URLSearchParams({code: incoming.searchParams.get('code') || '', client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${origin(request)}/api/auth/google/callback`, grant_type: 'authorization_code'});
  const token = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', body}).then(r => r.json());
  if (!token.access_token) return new Response('Connexion Google impossible.', {status: 400});
  const profile = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {headers: {authorization: `Bearer ${token.access_token}`}}).then(r => r.json());
  if (!profile.email_verified) return new Response('E-mail Google non vérifié.', {status: 403});
  const value = await makeSession({email: profile.email, name: profile.name || profile.email}, env);
  const next = readCookie(request, 'cshop_oauth_next');
  const destination = ['suivi', 'avis', 'administration', 'demande'].includes(next) ? `/?page=${next}` : '/';
  const headers = new Headers({location: destination});
  headers.append('set-cookie', cookie('cshop_session', value, 60 * 60 * 24 * 14));
  headers.append('set-cookie', 'cshop_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  headers.append('set-cookie', 'cshop_oauth_next=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return new Response(null, {status: 302, headers});
}
