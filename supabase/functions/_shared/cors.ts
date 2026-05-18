// Shared CORS helper for Scandinordic edge functions.
//
// Locks browser callers to the app's known origin(s). Native mobile clients
// (React Native fetch) do NOT send an Origin header, so CORS rules never
// apply to them — they keep working regardless of this allow-list.
//
// Customise per environment by setting the ALLOWED_ORIGINS edge function
// secret to a comma-separated list (e.g. for staging or local dev tunnels):
//   ALLOWED_ORIGINS=https://scandinordic.vercel.app,http://localhost:8081

const DEFAULT_ALLOWED_ORIGINS = ['https://scandinordic.vercel.app'];

const STATIC_CORS_HEADERS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
} as const;

export function corsHeadersFor(origin: string | null): Record<string, string> {
  const fromEnv = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const allowed = fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_ORIGINS;
  // Echo back the caller's origin only if it's on the allow-list.
  // For disallowed origins (or missing Origin), return the first allowed
  // origin so the browser sees a mismatch and rejects the response.
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    ...STATIC_CORS_HEADERS,
  };
}
