import 'server-only';

/**
 * Sending one email, through Resend's HTTP API.
 *
 * Configured by two variables in Vercel: RESEND_API_KEY and NOTIFY_FROM (an address on a
 * domain verified with Resend, e.g. "Vela <alerts@vela-coaching.com>"). Without them this
 * says so and sends nothing; callers keep whatever they were going to send for later.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM;
  if (!key || !from) return { ok: false, error: 'Email is not configured.' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
    });
    if (!res.ok) return { ok: false, error: `Resend answered ${res.status}` };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
