import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;
let isEthereal = false;

// Initialize Transporter
async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (user && pass) {
    console.log(`Email Service: Using SMTP configuration for ${user}`);
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: { user, pass }
    });
  } else {
    // Fallback: Create Ethereal test account automatically for local development
    console.log('Email Service: SMTP credentials missing in .env. Initializing Ethereal Test Email sandbox...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      isEthereal = true;
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log(`Email Service: Ethereal test SMTP configured. User: ${testAccount.user}`);
    } catch (err) {
      console.error('Email Service: Failed to create Ethereal test email account:', err);
      throw err;
    }
  }

  return transporter;
}

// Helper to send mail
async function sendMail(to: string, subject: string, html: string) {
  try {
    const client = await getTransporter();
    const fromAddress = process.env.EMAIL_FROM || '"CWH Youtube Jam" <no-reply@cwh-jam.com>';
    
    const info = await client.sendMail({
      from: fromAddress,
      to,
      subject,
      html
    });

    console.log(`Email sent successfully to ${to}. MessageId: ${info.messageId}`);
    
    if (isEthereal) {
      const url = nodemailer.getTestMessageUrl(info);
      console.log('---------------------------------------------------------');
      console.log(`[ETHEREAL EMAIL SANDBOX] Read your test email here:`);
      console.log(`👉 ${url}`);
      console.log('---------------------------------------------------------');
    }
  } catch (err) {
    console.error(`Email Service: Failed to send email to ${to}:`, err);
  }
}

// Send OTP verification code
export async function sendOTPEmail(to: string, otp: string, purpose: 'register' | 'reset') {
  const isRegister = purpose === 'register';
  const subject = isRegister ? 'CWH Jamming - Verify Your Registration' : 'CWH Jamming - Reset Your Password';
  
  const title = isRegister ? 'Confirm Your Registration' : 'Reset Your Password';
  const message = isRegister 
    ? 'Thank you for registering at CWH Youtube Jam. Use the 6-digit verification code below to verify your email and activate your account:'
    : 'We received a request to reset your password. Use the 6-digit verification code below to reset your password:';

  const html = `
    <div style="font-family: 'Outfit', sans-serif, Arial; max-width: 550px; margin: 0 auto; padding: 25px; border-radius: 12px; background: #0d0b18; color: #f8fafc; border: 1px solid rgba(255,255,255,0.08);">
      <h2 style="color: #8b5cf6; font-size: 22px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-top: 0;">${title}</h2>
      <p style="font-size: 15px; color: #cbd5e1; line-height: 1.5; margin: 15px 0;">${message}</p>
      
      <div style="text-align: center; margin: 25px 0;">
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 700; letter-spacing: 5px; color: #06b6d4; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 10px 25px; border-radius: 8px; display: inline-block; box-shadow: 0 0 15px rgba(6,182,212,0.15);">${otp}</span>
      </div>
      
      <p style="font-size: 13px; color: #64748b; margin-top: 25px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
        This code is valid for 5 minutes. If you did not make this request, please ignore this email.
      </p>
    </div>
  `;

  await sendMail(to, subject, html);
}

// Send Welcome Email
export async function sendWelcomeEmail(to: string, username: string) {
  const subject = 'Welcome to CWH Youtube Jam!';
  const html = `
    <div style="font-family: 'Outfit', sans-serif, Arial; max-width: 550px; margin: 0 auto; padding: 25px; border-radius: 12px; background: #0d0b18; color: #f8fafc; border: 1px solid rgba(255,255,255,0.08);">
      <h2 style="color: #8b5cf6; font-size: 22px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-top: 0;">Account Activated!</h2>
      <p style="font-size: 15px; color: #cbd5e1; line-height: 1.5; margin: 15px 0;">Hello <strong>${username}</strong>,</p>
      <p style="font-size: 15px; color: #cbd5e1; line-height: 1.5; margin: 15px 0;">Your email has been verified successfully. Your account is now active and ready!</p>
      <p style="font-size: 15px; color: #cbd5e1; line-height: 1.5; margin: 15px 0;">Welcome to <strong>CWH Youtube Jam</strong>. You can now create rooms, invite friends, queue up your playlists, and stream together completely ad-free!</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="http://localhost:5173" style="display: inline-block; background: #8b5cf6; color: white; padding: 12px 25px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);">Go to App Dashboard</a>
      </div>
      
      <p style="font-size: 13px; color: #64748b; margin-top: 25px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
        Enjoy the music!<br/>The CWH Jamming Team
      </p>
    </div>
  `;

  await sendMail(to, subject, html);
}
