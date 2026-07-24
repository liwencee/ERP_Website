import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const TO_EMAIL = process.env.CONTACT_EMAIL_TO || 'info@epraaccess.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'EPR Access Website <onboarding@resend.dev>';

const SUBJECT_LABELS: Record<string, string> = {
  investment: 'Investment Inquiry',
  account: 'Account Support',
  partnership: 'Partnership',
  other: 'Other',
};

export interface ContactSubmission {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
}

// Escape user-supplied text before interpolating into the HTML email body —
// this is read in a staff mail client, so unescaped input would be an
// HTML/link-injection vector into the business inbox.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendContactEmail(data: ContactSubmission): Promise<void> {
  if (!resend) {
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const subjectLabel = SUBJECT_LABELS[data.subject || ''] || 'General Enquiry';

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2733;">
      <h2 style="color:#0a1628;margin-bottom:4px;">New Contact Form Enquiry</h2>
      <p style="color:#6b7280;margin-top:0;">${escapeHtml(subjectLabel)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem;margin:12px 0;">
        <tr><td style="padding:4px 0;color:#6b7280;width:90px;">Name</td><td style="padding:4px 0;">${escapeHtml(data.name)}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Email</td><td style="padding:4px 0;">${escapeHtml(data.email)}</td></tr>
        ${data.phone ? `<tr><td style="padding:4px 0;color:#6b7280;">Phone</td><td style="padding:4px 0;">${escapeHtml(data.phone)}</td></tr>` : ''}
      </table>
      <p style="color:#6b7280;margin-bottom:4px;">Message</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;white-space:pre-wrap;">${escapeHtml(data.message)}</div>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    replyTo: data.email,
    subject: `New Enquiry: ${subjectLabel} — ${data.name}`,
    html,
  });

  if (error) {
    throw new Error(error.message);
  }
}
