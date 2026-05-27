/**
 * mailService.ts
 * Sends transactional email via Brevo HTTP API (no external libraries – native fetch only).
 * Falls back to console logging when BREVO_API_KEY is not configured (dev mode).
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

interface BrevoEmailPayload {
  sender: { name: string; email: string };
  to: Array<{ email: string }>;
  subject: string;
  htmlContent: string;
}

interface BrevoErrorResponse {
  message?: string;
  code?: string;
}

/** Build a branded HTML email body for the 6-digit verification code. */
function buildVerificationEmailHtml(code: string, recipientEmail: string): string {
  const digits = code.split('').map(d =>
    `<span style="
      display: inline-block;
      width: 44px;
      height: 52px;
      line-height: 52px;
      margin: 0 4px;
      background: #1a1a2e;
      border: 1px solid #2d2d4a;
      border-radius: 10px;
      font-size: 26px;
      font-weight: 700;
      color: #a78bfa;
      text-align: center;
      letter-spacing: 0;
    ">${d}</span>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Подтверждение Email — Upstat AI</title>
</head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;min-height:100vh;">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <!-- Card -->
        <table width="520" cellpadding="0" cellspacing="0"
          style="background:#13132b;border-radius:20px;border:1px solid #2d2d4a;overflow:hidden;max-width:100%;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding: 36px 40px 28px;">
              <div style="
                display:inline-flex;align-items:center;justify-content:center;
                background:linear-gradient(135deg,#7c3aed,#4f46e5);
                border-radius:14px;width:48px;height:48px;margin-bottom:20px;
              ">
                <!-- Shield icon (inline SVG) -->
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L3 7V12C3 16.55 6.84 20.74 12 22C17.16 20.74 21 16.55 21 12V7L12 2Z"
                    fill="white" fill-opacity="0.9"/>
                </svg>
              </div>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f0f0ff;letter-spacing:-0.3px;">
                Подтверждение Email
              </h1>
              <p style="margin:0;font-size:14px;color:#7c7c9a;line-height:1.5;">
                Используйте код ниже для подтверждения вашего аккаунта в <strong style="color:#a78bfa;">Upstat AI</strong>.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="height:1px;background:#2d2d4a;"></td></tr>

          <!-- OTP Code block -->
          <tr>
            <td align="center" style="padding: 36px 40px;">
              <p style="margin:0 0 20px;font-size:13px;color:#7c7c9a;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;">
                Ваш код верификации
              </p>
              <div style="display:block;text-align:center;margin-bottom:24px;">
                ${digits}
              </div>
              <div style="
                background:#0f0f1a;border-radius:10px;padding:12px 20px;
                border:1px solid #2d2d4a;display:inline-block;
              ">
                <p style="margin:0;font-size:12px;color:#7c7c9a;">
                  ⏳ Код действителен <strong style="color:#e2e2f0;">10 минут</strong>
                </p>
              </div>
            </td>
          </tr>

          <!-- Security notice -->
          <tr>
            <td align="center" style="padding: 0 40px 32px;">
              <p style="
                margin:0;font-size:12px;color:#55556b;
                border-top:1px solid #2d2d4a;padding-top:20px;line-height:1.6;
              ">
                Если вы не регистрировались в <strong style="color:#7c7c9a;">Upstat AI</strong>,
                просто проигнорируйте это письмо — ваш аккаунт останется в безопасности.<br/>
                Письмо отправлено для: <span style="color:#a78bfa;">${recipientEmail}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background:#0f0f1a;padding:20px 40px;border-top:1px solid #2d2d4a;">
              <p style="margin:0;font-size:11px;color:#44445a;">
                © ${new Date().getFullYear()} Upstat AI — ERP Portal. Все права защищены.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a 6-digit verification code to the given email address via Brevo HTTP API.
 * Falls back to console.log if BREVO_API_KEY is not set (useful for local development).
 *
 * @throws Error when Brevo returns a non-2xx response and we are NOT in fallback mode.
 */
export async function sendVerificationEmail(toEmail: string, code: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = (process.env.SENDER_EMAIL ?? 'no-reply@upstatai.com').trim();

  // --- Graceful dev fallback ---
  if (!apiKey) {
    console.log(`
  ==================================================
  [MAIL SERVICE — dev fallback: BREVO_API_KEY not set]
  To:      ${toEmail}
  Subject: Ваш код верификации Upstat AI
  Code:    ${code}
  ==================================================
    `);
    return;
  }

  const payload: BrevoEmailPayload = {
    sender: { name: 'Upstat AI', email: senderEmail },
    to: [{ email: toEmail }],
    subject: `${code} — ваш код подтверждения Upstat AI`,
    htmlContent: buildVerificationEmailHtml(code, toEmail),
  };

  let response: Response;
  try {
    response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkError: unknown) {
    const msg = networkError instanceof Error ? networkError.message : String(networkError);
    throw new Error(`[mailService] Network error contacting Brevo: ${msg}`);
  }

  if (!response.ok) {
    let errBody: BrevoErrorResponse = {};
    try {
      errBody = (await response.json()) as BrevoErrorResponse;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(
      `[mailService] Brevo returned ${response.status}: ${errBody.message ?? response.statusText}`
    );
  }
}
