import nodemailer from 'nodemailer';

// Email goes out through any SMTP account (Hostinger mail, Gmail with an app
// password, ...). Without SMTP settings nothing is sent and the message is
// printed to the server log instead, which is enough while developing.
const port = Number(process.env.SMTP_PORT || 465);
export const mailReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transport = mailReady
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

export async function sendMail({ to, subject, text, html }) {
  if (!transport) {
    console.log(`[mail not configured] to ${to}: ${subject}\n${text}`);
    return false;
  }
  await transport.sendMail({
    from: process.env.MAIL_FROM || `บ้านไร่ของพ่อ 344 <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });
  return true;
}
