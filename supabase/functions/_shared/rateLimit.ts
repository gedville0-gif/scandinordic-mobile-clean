// Database-backed per-user-per-endpoint rate limiter for Scandinordic edge
// functions. Reads/writes public.rate_limit_log via the service-role client.
//
// Failure mode: FAIL-OPEN. If the count query or the insert fails, we let
// the request through. We'd rather occasionally over-serve than lock real
// users out due to infrastructure hiccups.
//
// Usage:
//   const rl = await checkRateLimit(adminClient, userId, {
//     endpoint: 'delete-account',
//     windowMs: 60_000,
//     maxRequests: 5,
//   });
//   if (!rl.ok) return new Response(..., { status: 429, ... });

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RateLimitConfig {
  /** Identifier matching the `endpoint` column in rate_limit_log. */
  endpoint: string;
  /** Sliding window size in milliseconds (e.g. 60_000 = 1 minute). */
  windowMs: number;
  /** Allowed hits within the window before requests are rejected. */
  maxRequests: number;
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export async function checkRateLimit(
  admin: SupabaseClient,
  userId: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - config.windowMs).toISOString();

  const { count, error: countError } = await admin
    .from('rate_limit_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('endpoint', config.endpoint)
    .gte('hit_at', windowStart);

  if (countError) {
    console.error('[rate-limit] count query failed:', countError.message);
    return { ok: true }; // fail-open
  }

  if ((count ?? 0) >= config.maxRequests) {
    return { ok: false, retryAfterSeconds: Math.ceil(config.windowMs / 1000) };
  }

  const { error: insertError } = await admin
    .from('rate_limit_log')
    .insert({ user_id: userId, endpoint: config.endpoint });

  if (insertError) {
    // Still allow the request — the count check already passed.
    console.error('[rate-limit] insert failed:', insertError.message);
  }

  return { ok: true };
}
