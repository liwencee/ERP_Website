import transporter from '../config/email';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const FROM = `"EPR Access Limited" <${process.env.SMTP_USER}>`;

export async function sendVerificationEmail(email: string, firstName: string, token: string): Promise<void> {
  const url = `${APP_URL}/auth/verify-email/${token}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Verify your EPR Access account',
    html: `
      <h2>Welcome, ${firstName}!</h2>
      <p>Please verify your email address to activate your account.</p>
      <a href="${url}" style="background:#c9a84c;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;">Verify Email</a>
      <p>Or copy this link: ${url}</p>
      <p>This link expires in 24 hours.</p>
    `,
  });
}

export async function sendPasswordReset(email: string, firstName: string, token: string): Promise<void> {
  const url = `${APP_URL}/auth/reset-password/${token}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Reset your EPR Access password',
    html: `
      <h2>Password Reset Request</h2>
      <p>Hi ${firstName}, we received a request to reset your password.</p>
      <a href="${url}" style="background:#c9a84c;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;">Reset Password</a>
      <p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>
    `,
  });
}

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
    html: `
      <h2>Investment Confirmed!</h2>
      <p>Hi ${firstName}, your investment has been activated.</p>
      <table>
        <tr><td><strong>Plan</strong></td><td>${planName}</td></tr>
        <tr><td><strong>Amount</strong></td><td>₦${amount.toLocaleString()}</td></tr>
        <tr><td><strong>Maturity Date</strong></td><td>${maturityDate.toLocaleDateString('en-NG')}</td></tr>
      </table>
      <p>Track your investment from your <a href="${APP_URL}/dashboard">dashboard</a>.</p>
    `,
  });
}

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
    html: `
      <h2>Deposit Confirmed</h2>
      <p>Hi ${firstName}, your deposit has been confirmed and your wallet credited.</p>
      <table>
        <tr><td><strong>Amount</strong></td><td>₦${amount.toLocaleString()}</td></tr>
        <tr><td><strong>Reference</strong></td><td>${reference}</td></tr>
      </table>
      <p>View your wallet at <a href="${APP_URL}/dashboard/wallet">dashboard</a>.</p>
    `,
  });
}

export async function sendWithdrawalNotice(
  email: string,
  firstName: string,
  amount: number,
  status: string
): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `Withdrawal ${status} — EPR Access`,
    html: `
      <h2>Withdrawal Update</h2>
      <p>Hi ${firstName}, your withdrawal request of ₦${amount.toLocaleString()} has been <strong>${status.toLowerCase()}</strong>.</p>
      <p>Visit your <a href="${APP_URL}/dashboard/transactions">transactions page</a> for details.</p>
    `,
  });
}
