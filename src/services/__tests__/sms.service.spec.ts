import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from '../sms.service';
import { AwsConfigService } from '../../config/aws.config';
import * as AWS from 'aws-sdk';

jest.mock('aws-sdk', () => ({
  SNS: jest.fn(() => ({
    publish: jest.fn(),
  })),
}));

describe('SmsService', () => {
  let service: SmsService;
  let configService: ConfigService;
  let awsConfigService: AwsConfigService;
  let mockSNS: any;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockAwsConfigService = {
    getSNSClient: jest.fn(),
  };

  beforeEach(async () => {
    mockSNS = {
      publish: jest.fn().mockReturnThis(),
      promise: jest.fn(),
    };

    mockAwsConfigService.getSNSClient.mockReturnValue(mockSNS);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AwsConfigService,
          useValue: mockAwsConfigService,
        },
      ],
    }).compile();

    service = module.get<SmsService>(SmsService);
    configService = module.get<ConfigService>(ConfigService);
    awsConfigService = module.get<AwsConfigService>(AwsConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendVerificationCode', () => {
    it('should successfully send verification code via SMS', async () => {
      const phoneNumber = '+1234567890';
      const code = '123456';
      
      mockSNS.publish.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          MessageId: 'test-message-id',
        }),
      });

      mockConfigService.get.mockReturnValue('TestApp');

      const result = await service.sendVerificationCode(phoneNumber, code);

      expect(mockSNS.publish).toHaveBeenCalledWith({
        Message: `Your TestApp verification code is: 123456. This code will expire in 15 minutes.`,
        PhoneNumber: phoneNumber,
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: 'Transactional',
          },
        },
      });

      expect(result).toEqual({
        success: true,
        messageId: 'test-message-id',
      });
    });

    it('should handle SMS sending failure', async () => {
      const phoneNumber = '+1234567890';
      const code = '123456';
      
      mockSNS.publish.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('SMS sending failed')),
      });

      mockConfigService.get.mockReturnValue('TestApp');

      const result = await service.sendVerificationCode(phoneNumber, code);

      expect(result).toEqual({
        success: false,
        error: 'Failed to send SMS',
      });
    });
  });

  describe('sendMessage', () => {
    it('should successfully send custom message', async () => {
      const phoneNumber = '+1234567890';
      const message = 'Custom notification message';
      
      mockSNS.publish.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          MessageId: 'test-message-id',
        }),
      });

      const result = await service.sendMessage(phoneNumber, message);

      expect(mockSNS.publish).toHaveBeenCalledWith({
        Message: message,
        PhoneNumber: phoneNumber,
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: 'Promotional',
          },
        },
      });

      expect(result).toEqual({
        success: true,
        messageId: 'test-message-id',
      });
    });
  });

  describe('validatePhoneNumber', () => {
    it('should validate correct US phone number', () => {
      const validNumbers = [
        '+12345678901',
        '+1 234 567 8901',
        '+1-234-567-8901',
        '+1 (234) 567-8901',
      ];

      validNumbers.forEach(number => {
        expect(service.validatePhoneNumber(number)).toBe(true);
      });
    });

    it('should validate correct international phone numbers', () => {
      const validNumbers = [
        '+447123456789', // UK
        '+33123456789', // France
        '+49123456789', // Germany
        '+861234567890', // China
      ];

      validNumbers.forEach(number => {
        expect(service.validatePhoneNumber(number)).toBe(true);
      });
    });

    it('should reject invalid phone numbers', () => {
      const invalidNumbers = [
        '12345678901', // Missing +
        '+1234', // Too short
        '+123456789012345678', // Too long
        'not-a-number',
        '',
        null,
        undefined,
      ];

      invalidNumbers.forEach(number => {
        expect(service.validatePhoneNumber(number as any)).toBe(false);
      });
    });
  });

  describe('formatPhoneNumber', () => {
    it('should format US phone numbers correctly', () => {
      const testCases = [
        { input: '2345678901', expected: '+12345678901' },
        { input: '1234567890', expected: '+11234567890' },
        { input: '(234) 567-8901', expected: '+12345678901' },
        { input: '234-567-8901', expected: '+12345678901' },
        { input: '234.567.8901', expected: '+12345678901' },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(service.formatPhoneNumber(input, 'US')).toBe(expected);
      });
    });

    it('should preserve already formatted international numbers', () => {
      const phoneNumber = '+447123456789';
      
      expect(service.formatPhoneNumber(phoneNumber)).toBe(phoneNumber);
    });

    it('should handle country code formatting', () => {
      expect(service.formatPhoneNumber('7123456789', 'UK')).toBe('+447123456789');
      expect(service.formatPhoneNumber('123456789', 'FR')).toBe('+33123456789');
    });
  });

  describe('parsePhoneNumber', () => {
    it('should parse phone number components', () => {
      const result = service.parsePhoneNumber('+12345678901');
      
      expect(result).toEqual({
        countryCode: '+1',
        nationalNumber: '2345678901',
        formatted: '+1 234-567-8901',
        isValid: true,
      });
    });

    it('should handle invalid numbers', () => {
      const result = service.parsePhoneNumber('invalid');
      
      expect(result).toEqual({
        isValid: false,
        error: 'Invalid phone number format',
      });
    });
  });

  describe('getCountryFromPhone', () => {
    it('should identify country from phone number', () => {
      expect(service.getCountryFromPhone('+12345678901')).toBe('US');
      expect(service.getCountryFromPhone('+447123456789')).toBe('UK');
      expect(service.getCountryFromPhone('+33123456789')).toBe('FR');
      expect(service.getCountryFromPhone('+49123456789')).toBe('DE');
      expect(service.getCountryFromPhone('+861234567890')).toBe('CN');
    });

    it('should return null for unknown country codes', () => {
      expect(service.getCountryFromPhone('+9991234567')).toBeNull();
    });
  });

  describe('maskPhoneNumber', () => {
    it('should mask phone number for display', () => {
      expect(service.maskPhoneNumber('+12345678901')).toBe('+1234****901');
      expect(service.maskPhoneNumber('+447123456789')).toBe('+4471****789');
    });

    it('should handle short numbers', () => {
      expect(service.maskPhoneNumber('+1234')).toBe('+1**4');
    });
  });

  describe('SMS template methods', () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue('TestApp');
    });

    it('should generate verification code template', () => {
      const template = service.getVerificationCodeTemplate('123456');
      
      expect(template).toBe(
        'Your TestApp verification code is: 123456. This code will expire in 15 minutes.'
      );
    });

    it('should generate welcome SMS template', () => {
      const template = service.getWelcomeSmsTemplate('John');
      
      expect(template).toBe(
        'Welcome to TestApp, John! Your phone number has been successfully verified.'
      );
    });

    it('should generate security alert template', () => {
      const template = service.getSecurityAlertTemplate('login', 'New York');
      
      expect(template).toBe(
        'TestApp Security Alert: A login was detected from New York. If this wasn\'t you, please secure your account immediately.'
      );
    });
  });

  describe('Rate limiting helpers', () => {
    it('should calculate SMS cost estimate', () => {
      expect(service.estimateSmsCost('+12345678901')).toBe(0.0075); // US rate
      expect(service.estimateSmsCost('+447123456789')).toBe(0.04); // UK rate
      expect(service.estimateSmsCost('+33123456789')).toBe(0.08); // France rate
    });

    it('should check if number is premium rate', () => {
      expect(service.isPremiumRateNumber('+1900123456')).toBe(true);
      expect(service.isPremiumRateNumber('+12345678901')).toBe(false);
    });
  });
});