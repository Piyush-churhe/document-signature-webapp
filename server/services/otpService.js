const nodemailer = require('nodemailer');
const OTP = require('../models/OTP');

const OTP_EXPIRY_MS = 10 * 60 * 1000;

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

  return {
    sendMail: async (options) => {
      console.log('📧 [MOCK EMAIL OTP]', JSON.stringify(options, null, 2));
      return { messageId: `mock-otp-${Date.now()}` };
    },
  };
};

const maskEmail = (email) => {
  const [localPart, domain = ''] = String(email).split('@');
  if (!localPart) return email;

  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}***@${domain}`;
};

const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

const sendOTP = async ({ email, token, documentTitle, signerName }) => {
  if (!email || !token) {
    throw new Error('Email and token are required to send OTP');
  }

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await OTP.deleteMany({ token });

  await OTP.create({
    email: String(email).toLowerCase(),
    otp,
    token,
    expiresAt,
  });

  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"SignatureFlow" <${process.env.EMAIL_USER || 'noreply@signatureflow.io'}>`,
    to: email,
    subject: `Your SignatureFlow OTP for "${documentTitle}"`,
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 620px; margin: 0 auto; background: #f8fafc; padding: 40px 20px;">
        <div style="background: linear-gradient(135deg, #0f0f17 0%, #1a1a2e 100%); padding: 36px; border-radius: 16px; text-align: center; margin-bottom: 22px;">
          <h1 style="color: #e2c97e; margin: 0; font-size: 28px; letter-spacing: 1px;">SignatureFlow</h1>
          <p style="color: #9ca3af; margin: 8px 0 0;">Secure Signer Verification</p>
        </div>
        <div style="background: white; padding: 36px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.06);">
          <p style="font-size: 17px; color: #111827; margin-top: 0;">Hello ${signerName || 'Signer'},</p>
          <p style="color: #4b5563; line-height: 1.7;">Use the one-time password below to access and sign <strong>${documentTitle}</strong>.</p>
          <div style="margin: 28px 0; text-align: center;">
            <span style="display: inline-block; padding: 14px 24px; border-radius: 12px; letter-spacing: 8px; font-size: 34px; font-weight: 700; color: #0f172a; background: #f8fafc; border: 2px dashed #f59e0b;">${otp}</span>
          </div>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">This OTP expires in 10 minutes. Do not share this code with anyone.</p>
        </div>
      </div>
    `,
  });

  return maskEmail(email);
};

const verifyOTP = async ({ token, otp }) => {
  if (!token || !otp) {
    return { success: false, message: 'Token and OTP are required' };
  }

  const record = await OTP.findOne({ token, verified: false }).sort({ createdAt: -1 });
  if (!record) {
    return { success: false, message: 'OTP not found. Please request a new OTP.' };
  }

  if (new Date() > record.expiresAt) {
    await OTP.deleteMany({ token });
    return { success: false, message: 'OTP has expired. Please request a new OTP.' };
  }

  if (String(record.otp) !== String(otp).trim()) {
    return { success: false, message: 'Invalid OTP. Please try again.' };
  }

  record.verified = true;
  await record.save();

  return { success: true, message: 'OTP verified successfully' };
};

module.exports = {
  sendOTP,
  verifyOTP,
};
