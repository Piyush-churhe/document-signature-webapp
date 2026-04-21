const nodemailer = require('nodemailer');

const createTransporter = () => {
  const hasSmtpConfig = Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);

  if (hasSmtpConfig) {
    const secure = String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true' || Number(process.env.EMAIL_PORT) === 465;
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  // Mock transporter for development
  return {
    sendMail: async (options) => {
      console.log('📧 [MOCK EMAIL]', JSON.stringify(options, null, 2));
      return { messageId: 'mock-' + Date.now() };
    }
  };
};

const sendSigningRequest = async ({ to, signerName, ownerName, documentTitle, signingLink, message }) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"SignatureFlow" <${process.env.EMAIL_USER || 'noreply@signatureflow.io'}>`,
    to,
    subject: `${ownerName} has requested your signature on "${documentTitle}"`,
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 40px 20px;">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; border-radius: 16px; text-align: center; margin-bottom: 30px;">
          <h1 style="color: #e2c97e; margin: 0; font-size: 28px; letter-spacing: 1px;">SignatureFlow</h1>
          <p style="color: #a0aec0; margin: 8px 0 0;">Enterprise Document Signatures</p>
        </div>
        <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <p style="font-size: 18px; color: #1a202c; margin-top: 0;">Hello ${signerName || 'there'},</p>
          <p style="color: #4a5568; line-height: 1.6;"><strong>${ownerName}</strong> has requested your signature on the document: <strong>"${documentTitle}"</strong></p>
          ${message ? `<p style="background: #f7fafc; padding: 16px; border-left: 4px solid #e2c97e; border-radius: 4px; color: #4a5568; font-style: italic;">"${message}"</p>` : ''}
          <div style="text-align: center; margin: 30px 0;">
            <a href="${signingLink}" style="background: linear-gradient(135deg, #e2c97e 0%, #c9a227 100%); color: #1a1a2e; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block;">Review & Sign Document</a>
          </div>
          <p style="color: #a0aec0; font-size: 13px; text-align: center;">This link will expire once used. If you didn't expect this request, please ignore this email.</p>
        </div>
      </div>
    `,
  });
};

module.exports = { sendSigningRequest };
