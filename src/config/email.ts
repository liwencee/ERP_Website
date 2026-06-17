import { Resend } from 'resend';

// Production email transport.
//
// The Railway environment has RESEND_API_KEY set but NONE of the SMTP_* vars,
// so the old nodemailer transport silently failed on every send (which is why
// accounts used to be auto-verified — verification mail never arrived). We send
// via Resend's API instead, using the key that's already configured.
const resend = new Resend(process.env.RESEND_API_KEY);

// The "from" address must be on a domain verified in the Resend account.
// Configurable via EMAIL_FROM so it can change without a code edit; defaults to
// the company domain.
export const MAIL_FROM =
  process.env.EMAIL_FROM || 'EPR Access Limited <noreply@epraaccess.com>';

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

// Sends one email and THROWS on failure so callers can decide how to react
// (e.g. registration surfaces the error and offers a resend). Resend returns
// `{ data, error }` rather than throwing, so we normalise that here.
export async function sendMail(opts: MailOptions): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const { data, error } = await resend.emails.send({
    from: MAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });

  if (error) {
    throw new Error(
      `Resend send failed: ${error.message || JSON.stringify(error)}`
    );
  }

  return void data;
}

export default { sendMail, MAIL_FROM };
