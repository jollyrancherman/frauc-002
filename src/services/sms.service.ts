import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublishCommand } from '@aws-sdk/client-sns';
import { AwsConfigService } from '../config/aws.config';

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface PhoneNumberInfo {
  countryCode?: string;
  nationalNumber?: string;
  formatted?: string;
  isValid: boolean;
  error?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  
  // Country codes mapping
  private readonly countryCodes = {
    US: '+1',
    UK: '+44',
    FR: '+33',
    DE: '+49',
    CN: '+86',
    JP: '+81',
    IN: '+91',
    AU: '+61',
    CA: '+1',
    BR: '+55',
  };

  // SMS pricing per country (approximate in USD)
  private readonly smsPricing = {
    '+1': 0.0075,   // US/Canada
    '+44': 0.04,    // UK
    '+33': 0.08,    // France
    '+49': 0.075,   // Germany
    '+86': 0.025,   // China
    '+91': 0.002,   // India
    default: 0.05,  // Default international rate
  };

  constructor(
    private configService: ConfigService,
    private awsConfig: AwsConfigService,
  ) {}

  async sendSMS(phoneNumber: string, message: string): Promise<void> {
    // Ensure phone number is in E.164 format
    const formattedPhone = this.formatPhoneNumber(phoneNumber);

    const command = new PublishCommand({
      PhoneNumber: formattedPhone,
      Message: message,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional',
        },
      },
    });

    try {
      await this.awsConfig.getSNSClient().send(command);
      this.logger.log(`SMS sent successfully to ${this.maskPhoneNumber(formattedPhone)}`);
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${this.maskPhoneNumber(formattedPhone)}`, error);
      throw error;
    }
  }

  async sendVerificationCode(phoneNumber: string, code: string): Promise<SmsResult> {
    try {
      const appName = this.configService.get('APP_NAME', 'Frauc');
      const message = this.getVerificationCodeTemplate(code);
      await this.sendSMS(phoneNumber, message);
      
      return {
        success: true,
        messageId: `sms-${Date.now()}`,
      };
    } catch (error) {
      this.logger.error(`Failed to send verification code`, error);
      
      return {
        success: false,
        error: 'Failed to send SMS',
      };
    }
  }

  async sendMessage(phoneNumber: string, message: string, isTransactional = false): Promise<SmsResult> {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      const command = new PublishCommand({
        PhoneNumber: formattedPhone,
        Message: message,
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: isTransactional ? 'Transactional' : 'Promotional',
          },
        },
      });

      await this.awsConfig.getSNSClient().send(command);
      
      this.logger.log(`Custom SMS sent to ${this.maskPhoneNumber(formattedPhone)}`);
      
      return {
        success: true,
        messageId: `sms-${Date.now()}`,
      };
    } catch (error) {
      this.logger.error(`Failed to send custom SMS`, error);
      
      return {
        success: false,
        error: 'Failed to send SMS',
      };
    }
  }

  validatePhoneNumber(phoneNumber: string): boolean {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return false;
    }

    // Remove all non-digit characters except +
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    // Check if it starts with + and has between 10-15 digits
    const phoneRegex = /^\+\d{10,15}$/;
    
    return phoneRegex.test(cleaned);
  }

  formatPhoneNumber(phoneNumber: string, countryCode?: string): string {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // If already has + at the beginning, preserve it
    if (phoneNumber.startsWith('+')) {
      return '+' + cleaned;
    }
    
    // If country code is provided, add appropriate prefix
    if (countryCode && this.countryCodes[countryCode]) {
      const prefix = this.countryCodes[countryCode].substring(1); // Remove the +
      
      // Check if the number already starts with the country code
      if (!cleaned.startsWith(prefix)) {
        cleaned = prefix + cleaned;
      }
      
      return '+' + cleaned;
    }
    
    // For US numbers without country code
    if (cleaned.length === 10) {
      return '+1' + cleaned;
    }
    
    // If it's 11 digits and starts with 1 (US)
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return '+' + cleaned;
    }
    
    // Default: assume it needs a + prefix
    return '+' + cleaned;
  }

  parsePhoneNumber(phoneNumber: string): PhoneNumberInfo {
    try {
      if (!this.validatePhoneNumber(phoneNumber)) {
        return {
          isValid: false,
          error: 'Invalid phone number format',
        };
      }

      const cleaned = phoneNumber.replace(/[^\d+]/g, '');
      
      // Extract country code (simplified - real implementation would use libphonenumber)
      let countryCode = '';
      let nationalNumber = '';
      
      if (cleaned.startsWith('+1')) {
        countryCode = '+1';
        nationalNumber = cleaned.substring(2);
      } else if (cleaned.startsWith('+44')) {
        countryCode = '+44';
        nationalNumber = cleaned.substring(3);
      } else if (cleaned.startsWith('+')) {
        // Extract first 2-3 digits as country code
        const match = cleaned.match(/^\+(\d{1,3})/);
        if (match) {
          countryCode = '+' + match[1];
          nationalNumber = cleaned.substring(countryCode.length);
        }
      }
      
      // Format for display (US example)
      let formatted = cleaned;
      if (countryCode === '+1' && nationalNumber.length === 10) {
        formatted = `+1 ${nationalNumber.substring(0, 3)}-${nationalNumber.substring(3, 6)}-${nationalNumber.substring(6)}`;
      }
      
      return {
        countryCode,
        nationalNumber,
        formatted,
        isValid: true,
      };
    } catch (error) {
      return {
        isValid: false,
        error: 'Failed to parse phone number',
      };
    }
  }

  getCountryFromPhone(phoneNumber: string): string | null {
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    for (const [country, code] of Object.entries(this.countryCodes)) {
      if (cleaned.startsWith(code)) {
        return country;
      }
    }
    
    return null;
  }

  maskPhoneNumber(phoneNumber: string): string {
    if (!phoneNumber || phoneNumber.length < 7) {
      return phoneNumber?.replace(/\d(?=\d{1})/g, '*') || '';
    }
    
    // Keep first 4 and last 3 digits, mask the middle
    const start = phoneNumber.substring(0, 5);
    const end = phoneNumber.substring(phoneNumber.length - 3);
    const masked = '*'.repeat(Math.max(0, phoneNumber.length - 8));
    
    return start + masked + end;
  }

  // Template methods
  getVerificationCodeTemplate(code: string): string {
    const appName = this.configService.get('APP_NAME', 'Frauc');
    return `Your ${appName} verification code is: ${code}. This code will expire in 15 minutes.`;
  }

  getWelcomeSmsTemplate(name: string): string {
    const appName = this.configService.get('APP_NAME', 'Frauc');
    return `Welcome to ${appName}, ${name}! Your phone number has been successfully verified.`;
  }

  getSecurityAlertTemplate(action: string, location?: string): string {
    const appName = this.configService.get('APP_NAME', 'Frauc');
    const locationText = location ? ` from ${location}` : '';
    return `${appName} Security Alert: A ${action} was detected${locationText}. If this wasn't you, please secure your account immediately.`;
  }

  getPasswordResetTemplate(code: string): string {
    const appName = this.configService.get('APP_NAME', 'Frauc');
    return `Your ${appName} password reset code is: ${code}. Do not share this code with anyone.`;
  }

  // Cost estimation
  estimateSmsCost(phoneNumber: string): number {
    const country = this.getCountryFromPhone(phoneNumber);
    const countryCode = country ? this.countryCodes[country] : null;
    
    if (countryCode && this.smsPricing[countryCode]) {
      return this.smsPricing[countryCode];
    }
    
    return this.smsPricing.default;
  }

  // Check if number is premium rate
  isPremiumRateNumber(phoneNumber: string): boolean {
    const premiumPrefixes = [
      '+1900', // US premium
      '+1976', // US premium
      '+44900', // UK premium
      '+44901', // UK premium
    ];
    
    return premiumPrefixes.some(prefix => phoneNumber.startsWith(prefix));
  }

  // Validate number is mobile (simplified - real implementation would use carrier lookup)
  isMobileNumber(phoneNumber: string): boolean {
    // This is a simplified check
    // In production, you'd use AWS SNS phone number validation or a service like Twilio Lookup
    
    // Exclude known landline patterns (very simplified)
    const landlinePatterns = [
      /^\+1[2-9]0[0-9]/, // Some US landline patterns
      /^\+44[1-2]/, // Some UK landline patterns
    ];
    
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    return !landlinePatterns.some(pattern => pattern.test(cleaned));
  }

  // Get SMS character count and segment info
  getSmsInfo(message: string): { characterCount: number; segments: number; encoding: string } {
    const length = message.length;
    let segments = 1;
    let encoding = 'GSM-7';
    
    // Check for Unicode characters
    if (/[^\x00-\x7F]/.test(message)) {
      encoding = 'UCS-2';
      segments = Math.ceil(length / 70);
    } else {
      // GSM-7 encoding
      if (length <= 160) {
        segments = 1;
      } else {
        segments = Math.ceil(length / 153); // 153 chars per segment for concatenated SMS
      }
    }
    
    return {
      characterCount: length,
      segments,
      encoding,
    };
  }
}