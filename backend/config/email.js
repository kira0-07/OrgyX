const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Initialize Resend conditionally
const resendApiKey = process.env.RESEND_API_KEY;
const resend = (resendApiKey && resendApiKey.startsWith('re_')) ? new Resend(resendApiKey) : null;

// Fallback nodemailer transport for development
const createTestTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: process.env.ETHEREAL_USER,
      pass: process.env.ETHEREAL_PASS
    }
  });
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (process.env.RESEND_API_KEY) {
      const { data, error } = await resend.emails.send({
        from: 'OrgOS <noreply@orgos.app>',
        to,
        subject,
        html,
        text
      });

      if (error) {
        throw new Error(error.message);
      }

      logger.info(`Email sent successfully to ${to}`);
      return { success: true, id: data.id };
    } else {
      // Development fallback
      const transporter = createTestTransporter();
      const info = await transporter.sendMail({
        from: 'OrgOS <dev@orgos.app>',
        to,
        subject,
        html,
        text
      });

      logger.info(`Development email sent: ${info.messageId}`);
      return { success: true, id: info.messageId };
    }
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
    throw error;
  }
};

const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Reset Your OrgOS Password</h2>
      <p>You requested a password reset for your OrgOS account.</p>
      <p>Click the button below to reset your password:</p>
      <a href="${resetUrl}"
         style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px;
                text-decoration: none; border-radius: 6px; margin: 16px 0;">
        Reset Password
      </a>
      <p style="color: #666; font-size: 14px;">
        This link will expire in 1 hour. If you didn't request this reset, please ignore this email.
      </p>
    </div>
  `;

  const text = `
    Reset Your OrgOS Password

    You requested a password reset for your OrgOS account.

    Click this link to reset your password: ${resetUrl}

    This link will expire in 1 hour. If you didn't request this reset, please ignore this email.
  `;

  return sendEmail({
    to: email,
    subject: 'Reset Your OrgOS Password',
    html,
    text
  });
};

const sendWelcomeEmail = async (email, name) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to OrgOS, ${name}!</h2>
      <p>Your account has been created successfully.</p>
      <p>OrgOS is your AI-powered organization operating system that helps you:</p>
      <ul>
        <li>Track performance and attendance</li>
        <li>Manage meetings with AI-powered transcription</li>
        <li>Get intelligent recommendations</li>
        <li>Collaborate with your team</li>
      </ul>
      <p>Login at: <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login">
        ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login
      </a></p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Welcome to OrgOS!',
    html,
    text: `Welcome to OrgOS, ${name}! Your account has been created successfully.`
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail
};
