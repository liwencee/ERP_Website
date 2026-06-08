import transporter from '../config/email';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const FROM = `"EPR Access Limited" <${process.env.SMTP_USER}>`;

// ─── Brand colours ───────────────────────────────────────────────────────────
const BRAND_RED   = '#CC1A1A';
const BRAND_GREEN = '#2ECC2E';
const BRAND_NAVY  = '#0a1628';

// ─── Shared email wrapper ────────────────────────────────────────────────────
function emailWrapper(bodyHtml: string): string {
  return `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:0 0 32px;">
      <!-- Header -->
      <div style="background:${BRAND_NAVY};padding:24px 32px;text-align:center;">
        <img src="${APP_URL}/images/logo.png" alt="EPR Access Limited" style="height:56px;width:auto;" />
      </div>
      <!-- Body -->
      <div style="background:#ffffff;padding:36px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        ${bodyHtml}
      </div>
      <!-- Footer -->
      <div style="padding:20px 32px;text-align:center;">
        <p style="font-size:0.78rem;color:#9ca3af;margin:0;">
          &copy; ${new Date().getFullYear()} EPR Access Limited &mdash; 54b Adeniyi Jones, Ikeja, Lagos
        </p>
        <p style="font-size:0.78rem;color:#9ca3af;margin:4px 0 0;">
          <a href="${APP_URL}/dashboard" style="color:${BRAND_RED};text-decoration:none;">Go to Dashboard</a>
        </p>
      </div>
    </div>
  `;
}

function ctaButton(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:${BRAND_RED};color:#ffffff;
    padding:13px 28px;text-decoration:none;border-radius:6px;font-weight:600;
    font-size:0.95rem;margin:20px 0;">${text}</a>`;
}

// ─── Verify Email ────────────────────────────────────────────────────────────
export async function sendVerificationEmail(
  email: string, firstName: string, token: string
): Promise<void> {
  const url = `${APP_URL}/auth/verify-email/${token}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Verify your EPR Access account',
    html: emailWrapper(`
      <h2 style="color:${BRAND_NAVY};margin:0 0 8px;">Welcome, ${firstName}!</h2>
      <p style="color:#4b5563;">Please verify your email address to activate your account.</p>
      ${ctaButton('Verify Email', url)}
      <p style="font-size:0.85rem;color:#6b7280;">Or copy this link into your browser:<br>
        <a href="${url}" style="color:${BRAND_RED};word-break:break-all;">${url}</a>
      </p>
      <p style="font-size:0.82rem;color:#9ca3af;">This link expires in 24 hours.</p>
    `),
  });
}

// ─── Password Reset ──────────────────────────────────────────────────────────
export async function sendPasswordReset(
  email: string, firstName: string, token: string
): Promise<void> {
  const url = `${APP_URL}/auth/reset-password/${token}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Reset your EPR Access password',
    html: emailWrapper(`
      <h2 style="color:${BRAND_NAVY};margin:0 0 8px;">Password Reset</h2>
      <p style="color:#4b5563;">Hi ${firstName}, we received a request to reset your EPR Access password.</p>
      ${ctaButton('Reset Password', url)}
      <p style="font-size:0.82rem;color:#9ca3af;">
        This link expires in 1 hour. If you did not request this, please ignore this email.
      </p>
    `),
  });
}

// ─── Investment Confirmation ─────────────────────────────────────────────────
export async function sendInvestmentConfirmation(
  email: string,
  firstName: string,
  planName: string,
  amount: number,
  maturityDate: Date
): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Investment Confirmed — EPR Access',
    html: emailWrapper(`
      <h2 style="color:${BRAND_NAVY};margin:0 0 8px;">Investment Activated!</h2>
      <p style="color:#4b5563;">Hi ${firstName}, your investment is now active and earning returns.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:0.92rem;">
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Plan</td>
          <td style="padding:10px 14px;border:1px solid #e5e7eb;color:${BRAND_NAVY};">${planName}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Amount</td>
          <td style="padding:10px 14px;border:1px solid #e5e7eb;color:${BRAND_NAVY};">₦${amount.toLocaleString()}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Maturity Date</td>
          <td style="padding:10px 14px;border:1px solid #e5e7eb;color:${BRAND_GREEN};font-weight:700;">
            ${maturityDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
          </td>
        </tr>
      </table>
      ${ctaButton('Track Investment', `${APP_URL}/dashboard/investments`)}
    `),
  });
}

// ─── Deposit Confirmed ───────────────────────────────────────────────────────
export async function sendDepositConfirmed(
  email: string,
  firstName: string,
  amount: number,
  reference: string
): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Deposit Confirmed — EPR Access',
    html: emailWrapper(`
      <h2 style="color:${BRAND_NAVY};margin:0 0 8px;">Deposit Confirmed</h2>
      <p style="color:#4b5563;">Hi ${firstName}, your deposit has been confirmed and credited to your wallet.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:0.92rem;">
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Amount Credited</td>
          <td style="padding:10px 14px;border:1px solid #e5e7eb;color:${BRAND_GREEN};font-weight:700;">₦${amount.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Reference</td>
          <td style="padding:10px 14px;border:1px solid #e5e7eb;color:${BRAND_NAVY};font-family:monospace;">${reference}</td>
        </tr>
      </table>
      ${ctaButton('Go to Wallet', `${APP_URL}/dashboard/wallet`)}
    `),
  });
}

// ─── Withdrawal Notice ───────────────────────────────────────────────────────
export async function sendWithdrawalNotice(
  email: string,
  firstName: string,
  amount: number,
  status: 'Confirmed' | 'Rejected'
): Promise<void> {
  const isConfirmed = status === 'Confirmed';
  const accentColor  = isConfirmed ? BRAND_GREEN : BRAND_RED;
  const statusMsg    = isConfirmed
    ? 'has been processed and sent to your bank account.'
    : 'was rejected and the amount has been refunded to your wallet.';

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `Withdrawal ${status} — EPR Access`,
    html: emailWrapper(`
      <h2 style="color:${BRAND_NAVY};margin:0 0 8px;">Withdrawal ${status}</h2>
      <p style="color:#4b5563;">Hi ${firstName}, your withdrawal request of
        <strong style="color:${accentColor};">₦${amount.toLocaleString()}</strong>
        ${statusMsg}
      </p>
      ${!isConfirmed
        ? `<p style="font-size:0.88rem;color:#6b7280;">
            If you believe this is an error, please contact our support team.
           </p>`
        : ''
      }
      ${ctaButton('View Transactions', `${APP_URL}/dashboard/transactions`)}
    `),
  });
}
