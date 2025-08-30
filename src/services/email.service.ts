import { Injectable, Logger } from '@nestjs/common';
import { SendEmailCommand } from '@aws-sdk/client-ses';
import { AwsConfigService } from '../config/aws.config';

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private awsConfig: AwsConfigService) {}

  async sendEmail(
    to: string | string[],
    template: EmailTemplate,
    fromEmail?: string,
  ): Promise<void> {
    const recipients = Array.isArray(to) ? to : [to];
    const sender = fromEmail || this.awsConfig.getSESFromEmail();

    const command = new SendEmailCommand({
      Source: sender,
      Destination: {
        ToAddresses: recipients,
      },
      Message: {
        Subject: {
          Data: template.subject,
        },
        Body: {
          Html: {
            Data: template.htmlBody,
          },
          Text: template.textBody ? {
            Data: template.textBody,
          } : undefined,
        },
      },
    });

    try {
      await this.awsConfig.getSESClient().send(command);
      this.logger.log(`Email sent successfully to ${recipients.join(', ')}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${recipients.join(', ')}`, error);
      throw error;
    }
  }

  async sendVerificationEmail(email: string, verificationCode: string): Promise<void> {
    const template: EmailTemplate = {
      subject: '🔐 Verify Your Email Address - Frauc',
      htmlBody: this.buildVerificationEmailTemplate(verificationCode),
      textBody: this.buildVerificationEmailTextTemplate(verificationCode),
    };

    await this.sendEmail(email, template);
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    const template: EmailTemplate = {
      subject: '🎉 Welcome to Frauc - Your Account is Ready!',
      htmlBody: this.buildWelcomeEmailTemplate(firstName),
      textBody: this.buildWelcomeEmailTextTemplate(firstName),
    };

    await this.sendEmail(email, template);
  }

  private buildVerificationEmailTemplate(verificationCode: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email - Frauc</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0; 
              padding: 0; 
              background-color: #f8f9fa;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white; 
              border-radius: 8px; 
              overflow: hidden;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; 
              padding: 30px 20px; 
              text-align: center; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 28px; 
              font-weight: 600; 
            }
            .content { 
              padding: 30px 20px; 
            }
            .verification-code { 
              background: #f8f9fa; 
              border: 2px dashed #667eea; 
              padding: 25px; 
              text-align: center; 
              font-size: 32px; 
              font-weight: bold; 
              letter-spacing: 4px; 
              margin: 25px 0; 
              border-radius: 8px;
              color: #667eea;
              font-family: 'Courier New', monospace;
            }
            .footer { 
              background: #f8f9fa; 
              padding: 20px; 
              text-align: center; 
              font-size: 12px; 
              color: #6c757d; 
              border-top: 1px solid #e9ecef;
            }
            .button {
              display: inline-block;
              background: #667eea;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              margin: 20px 0;
            }
            .warning {
              background: #fff3cd;
              border: 1px solid #ffeaa7;
              color: #856404;
              padding: 15px;
              border-radius: 6px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Verify Your Email</h1>
              <p>Welcome to Frauc Marketplace</p>
            </div>
            <div class="content">
              <h2>Almost there! 🚀</h2>
              <p>Thank you for joining Frauc! To complete your registration and secure your account, please enter this verification code:</p>
              
              <div class="verification-code">
                ${verificationCode}
              </div>
              
              <p><strong>⏰ This code expires in 15 minutes</strong></p>
              
              <div class="warning">
                <strong>Security Note:</strong> If you didn't create a Frauc account, please ignore this email. Your email address may have been entered by mistake.
              </div>
              
              <p>Once verified, you'll be able to:</p>
              <ul>
                <li>🛍️ Browse and bid on marketplace items</li>
                <li>📦 List your own items for sale</li>
                <li>💬 Connect with other community members</li>
                <li>🔔 Receive personalized notifications</li>
              </ul>
              
              <p>Need help? Contact our support team - we're here to help!</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Frauc Marketplace. All rights reserved.</p>
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private buildVerificationEmailTextTemplate(verificationCode: string): string {
    return `
🔐 VERIFY YOUR EMAIL - FRAUC MARKETPLACE

Welcome to Frauc!

Almost there! 🚀

Thank you for joining Frauc! To complete your registration and secure your account, please enter this verification code:

VERIFICATION CODE: ${verificationCode}

⏰ This code expires in 15 minutes

SECURITY NOTE: If you didn't create a Frauc account, please ignore this email. Your email address may have been entered by mistake.

Once verified, you'll be able to:
• 🛍️ Browse and bid on marketplace items
• 📦 List your own items for sale  
• 💬 Connect with other community members
• 🔔 Receive personalized notifications

Need help? Contact our support team - we're here to help!

---
© ${new Date().getFullYear()} Frauc Marketplace. All rights reserved.
This is an automated message, please do not reply to this email.
    `;
  }

  private buildWelcomeEmailTemplate(firstName: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Frauc!</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0; 
              padding: 0; 
              background-color: #f8f9fa;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white; 
              border-radius: 8px; 
              overflow: hidden;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header { 
              background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
              color: white; 
              padding: 40px 20px; 
              text-align: center; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 32px; 
              font-weight: 600; 
            }
            .content { 
              padding: 30px 20px; 
            }
            .feature-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
              gap: 20px;
              margin: 25px 0;
            }
            .feature-card {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              text-align: center;
              border: 1px solid #e9ecef;
            }
            .feature-card h3 {
              margin: 10px 0;
              color: #28a745;
            }
            .cta-button {
              display: inline-block;
              background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
              color: white;
              padding: 15px 30px;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              font-size: 16px;
              margin: 20px 0;
              text-align: center;
            }
            .footer { 
              background: #f8f9fa; 
              padding: 20px; 
              text-align: center; 
              font-size: 12px; 
              color: #6c757d; 
              border-top: 1px solid #e9ecef;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to Frauc!</h1>
              <p>Your marketplace journey begins now</p>
            </div>
            <div class="content">
              <h2>Hi ${firstName}! 👋</h2>
              <p>Congratulations! Your Frauc account is now active and ready to go. We're thrilled to have you join our growing marketplace community.</p>
              
              <div class="feature-grid">
                <div class="feature-card">
                  <h3>🛍️ Discover Amazing Deals</h3>
                  <p>Browse thousands of unique items from trusted sellers in your area.</p>
                </div>
                <div class="feature-card">
                  <h3>📦 Sell Your Items</h3>
                  <p>Turn your unused items into cash with our easy listing process.</p>
                </div>
                <div class="feature-card">
                  <h3>💬 Connect & Chat</h3>
                  <p>Message sellers directly to ask questions and negotiate prices.</p>
                </div>
                <div class="feature-card">
                  <h3>🔔 Stay Updated</h3>
                  <p>Get notifications when items you're interested in become available.</p>
                </div>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'https://frauc.com'}" class="cta-button">
                  Start Exploring 🚀
                </a>
              </div>
              
              <div style="background: #e7f3ff; padding: 20px; border-radius: 8px; border-left: 4px solid #0066cc; margin: 25px 0;">
                <h3 style="margin: 0 0 10px 0; color: #0066cc;">💡 Pro Tips for New Users:</h3>
                <ul style="margin: 0; padding-left: 20px;">
                  <li>Complete your profile to build trust with other users</li>
                  <li>Add a profile photo to make your listings more appealing</li>
                  <li>Enable location services to find deals near you</li>
                  <li>Follow our community guidelines for the best experience</li>
                </ul>
              </div>
              
              <p>Questions or need help getting started? Our support team is just a message away!</p>
              
              <p>Happy trading! 🤝</p>
              <p><strong>The Frauc Team</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Frauc Marketplace. All rights reserved.</p>
              <p>You received this email because you created a Frauc account.</p>
              <p>
                <a href="${process.env.FRONTEND_URL}/unsubscribe" style="color: #6c757d;">Unsubscribe</a> |
                <a href="${process.env.FRONTEND_URL}/help" style="color: #6c757d;">Help Center</a> |
                <a href="${process.env.FRONTEND_URL}/contact" style="color: #6c757d;">Contact Us</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private buildWelcomeEmailTextTemplate(firstName: string): string {
    return `
🎉 WELCOME TO FRAUC MARKETPLACE!

Hi ${firstName}! 👋

Congratulations! Your Frauc account is now active and ready to go. We're thrilled to have you join our growing marketplace community.

WHAT YOU CAN DO NOW:
• 🛍️ Discover Amazing Deals - Browse thousands of unique items from trusted sellers
• 📦 Sell Your Items - Turn your unused items into cash with our easy listing process  
• 💬 Connect & Chat - Message sellers directly to ask questions and negotiate
• 🔔 Stay Updated - Get notifications when items you're interested in become available

💡 PRO TIPS FOR NEW USERS:
• Complete your profile to build trust with other users
• Add a profile photo to make your listings more appealing
• Enable location services to find deals near you
• Follow our community guidelines for the best experience

Ready to start? Visit: ${process.env.FRONTEND_URL || 'https://frauc.com'}

Questions or need help getting started? Our support team is just a message away!

Happy trading! 🤝

The Frauc Team

---
© ${new Date().getFullYear()} Frauc Marketplace. All rights reserved.
You received this email because you created a Frauc account.

Unsubscribe: ${process.env.FRONTEND_URL}/unsubscribe
Help Center: ${process.env.FRONTEND_URL}/help
Contact Us: ${process.env.FRONTEND_URL}/contact
    `;
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;
    
    const template: EmailTemplate = {
      subject: 'Reset Your Password - Frauc',
      htmlBody: `
        <html>
          <body>
            <h2>Password Reset Request</h2>
            <p>We received a request to reset your password for your Frauc account.</p>
            <p>Click the link below to reset your password:</p>
            <div style="margin: 20px 0;">
              <a href="${resetUrl}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all;">${resetUrl}</p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this password reset, please ignore this email.</p>
            <p>Best regards,<br>The Frauc Team</p>
          </body>
        </html>
      `,
      textBody: `
        Password Reset Request
        
        We received a request to reset your password for your Frauc account.
        
        Copy and paste this link into your browser to reset your password:
        ${resetUrl}
        
        This link will expire in 1 hour.
        
        If you didn't request this password reset, please ignore this email.
        
        Best regards,
        The Frauc Team
      `,
    };

    await this.sendEmail(email, template);
  }
}