import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { PhoneVerificationService } from '../phone-verification.service';
import { SmsService } from '../../services/sms.service';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../config/redis.config';
import { PhoneVerification } from '../entities/phone-verification.entity';
import { User } from '../../users/entities/user.entity';

describe('PhoneVerificationService', () => {
  let service: PhoneVerificationService;
  let smsService: SmsService;
  let usersService: UsersService;
  let redisService: RedisService;
  let phoneVerificationRepository: Repository<PhoneVerification>;

  const mockSmsService = {
    sendVerificationCode: jest.fn(),
    sendMessage: jest.fn(),
    validatePhoneNumber: jest.fn(),
    formatPhoneNumber: jest.fn(),
    maskPhoneNumber: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
    findByPhone: jest.fn(),
    update: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  };

  const mockPhoneVerificationRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhoneVerificationService,
        {
          provide: SmsService,
          useValue: mockSmsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: getRepositoryToken(PhoneVerification),
          useValue: mockPhoneVerificationRepository,
        },
      ],
    }).compile();

    service = module.get<PhoneVerificationService>(PhoneVerificationService);
    smsService = module.get<SmsService>(SmsService);
    usersService = module.get<UsersService>(UsersService);
    redisService = module.get<RedisService>(RedisService);
    phoneVerificationRepository = module.get<Repository<PhoneVerification>>(
      getRepositoryToken(PhoneVerification),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initiatePhoneVerification', () => {
    it('should successfully initiate phone verification for new phone number', async () => {
      const phoneNumber = '+1234567890';
      const userId = 1;
      const user = { id: userId, email: 'test@example.com' };
      const verificationCode = '123456';

      mockUsersService.findOne.mockResolvedValue(user);
      mockUsersService.findByPhone.mockResolvedValue(null);
      mockSmsService.validatePhoneNumber.mockReturnValue(true);
      mockSmsService.formatPhoneNumber.mockReturnValue(phoneNumber);
      mockRedisService.get.mockResolvedValue(null); // No rate limit
      
      const mockVerification = {
        id: 1,
        phoneNumber,
        verificationCode,
        userId,
        isVerified: false,
        attempts: 0,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        resetAttempts: jest.fn(),
        extendExpiration: jest.fn(),
      };

      mockPhoneVerificationRepository.create.mockReturnValue(mockVerification);
      mockPhoneVerificationRepository.save.mockResolvedValue(mockVerification);
      mockSmsService.sendVerificationCode.mockResolvedValue({ success: true });
      mockSmsService.maskPhoneNumber.mockReturnValue(phoneNumber);

      jest.spyOn(service as any, 'generateVerificationCode').mockReturnValue(verificationCode);

      const result = await service.initiatePhoneVerification(userId, phoneNumber);

      expect(mockSmsService.validatePhoneNumber).toHaveBeenCalledWith(phoneNumber);
      expect(mockSmsService.sendVerificationCode).toHaveBeenCalledWith(phoneNumber, verificationCode);
      expect(result).toEqual({
        success: true,
        message: 'Verification code sent to your phone',
        phoneNumber,
        expiresIn: 900, // 15 minutes
      });
    });

    it('should throw BadRequestException for invalid phone number', async () => {
      const phoneNumber = 'invalid';
      const userId = 1;

      mockUsersService.findOne.mockResolvedValue({ id: userId });
      mockSmsService.validatePhoneNumber.mockReturnValue(false);

      await expect(service.initiatePhoneVerification(userId, phoneNumber))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if phone is already taken', async () => {
      const phoneNumber = '+1234567890';
      const userId = 1;

      mockUsersService.findOne.mockResolvedValue({ id: userId });
      mockSmsService.validatePhoneNumber.mockReturnValue(true);
      mockSmsService.formatPhoneNumber.mockReturnValue(phoneNumber);
      mockUsersService.findByPhone.mockResolvedValue({ id: 999 }); // Different user

      await expect(service.initiatePhoneVerification(userId, phoneNumber))
        .rejects.toThrow('Phone number is already in use');
    });

    it('should enforce rate limiting', async () => {
      const phoneNumber = '+1234567890';
      const userId = 1;

      mockUsersService.findOne.mockResolvedValue({ id: userId });
      mockSmsService.validatePhoneNumber.mockReturnValue(true);
      mockSmsService.formatPhoneNumber.mockReturnValue(phoneNumber);
      mockUsersService.findByPhone.mockResolvedValue(null);
      mockRedisService.get.mockResolvedValue('5'); // Max attempts reached

      await expect(service.initiatePhoneVerification(userId, phoneNumber))
        .rejects.toThrow(HttpException);
    });
  });

  describe('verifyPhone', () => {
    it('should successfully verify phone with correct code', async () => {
      const userId = 1;
      const phoneNumber = '+1234567890';
      const verificationCode = '123456';
      
      const mockVerification = {
        id: 1,
        phoneNumber,
        verificationCode,
        userId,
        isVerified: false,
        attempts: 0,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isExpired: false,
        markAsVerified: jest.fn(),
        verifiedAt: new Date(),
      };

      const mockUser = {
        id: userId,
        phone: null,
        phoneVerified: false,
      };

      mockPhoneVerificationRepository.findOne.mockResolvedValue(mockVerification);
      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockUsersService.update.mockResolvedValue({
        ...mockUser,
        phone: phoneNumber,
        phoneVerified: true,
      });
      mockSmsService.maskPhoneNumber.mockReturnValue(phoneNumber);

      const result = await service.verifyPhone(userId, verificationCode);

      expect(mockVerification.markAsVerified).toHaveBeenCalled();
      expect(mockPhoneVerificationRepository.update).toHaveBeenCalledWith(
        { id: mockVerification.id },
        { isVerified: true, verifiedAt: mockVerification.verifiedAt }
      );
      expect(mockUsersService.update).toHaveBeenCalledWith(userId, {
        phone: phoneNumber,
        phoneVerified: true,
      });
      expect(result).toEqual({
        success: true,
        message: 'Phone number verified successfully',
        phoneNumber,
      });
    });

    it('should throw BadRequestException for invalid code', async () => {
      const userId = 1;
      const verificationCode = '999999';
      
      const mockVerification = {
        id: 1,
        phoneNumber: '+1234567890',
        verificationCode: '123456',
        userId,
        isVerified: false,
        attempts: 2,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isExpired: false,
      };

      mockPhoneVerificationRepository.findOne.mockResolvedValue(mockVerification);
      mockPhoneVerificationRepository.update.mockResolvedValue({});

      await expect(service.verifyPhone(userId, verificationCode))
        .rejects.toThrow(BadRequestException);
      
      expect(mockPhoneVerificationRepository.update).toHaveBeenCalledWith(
        { id: mockVerification.id },
        { attempts: 3 }
      );
    });

    it('should throw BadRequestException for expired code', async () => {
      const userId = 1;
      const verificationCode = '123456';
      
      const mockVerification = {
        id: 1,
        phoneNumber: '+1234567890',
        verificationCode,
        userId,
        isVerified: false,
        attempts: 0,
        expiresAt: new Date(Date.now() - 1000), // Expired
        get isExpired() { return true; },
      };

      mockPhoneVerificationRepository.findOne.mockResolvedValue(mockVerification);

      await expect(service.verifyPhone(userId, verificationCode))
        .rejects.toThrow('Verification code has expired');
    });

    it('should throw BadRequestException after max attempts', async () => {
      const userId = 1;
      const verificationCode = '999999';
      
      const mockVerification = {
        id: 1,
        phoneNumber: '+1234567890',
        verificationCode: '123456',
        userId,
        isVerified: false,
        attempts: 4, // Already at max
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isExpired: false,
      };

      mockPhoneVerificationRepository.findOne.mockResolvedValue(mockVerification);

      await expect(service.verifyPhone(userId, verificationCode))
        .rejects.toThrow('Maximum verification attempts exceeded');
    });
  });

  describe('resendVerificationCode', () => {
    it('should successfully resend verification code', async () => {
      const userId = 1;
      const phoneNumber = '+1234567890';
      const newCode = '654321';
      
      const mockVerification = {
        id: 1,
        phoneNumber,
        verificationCode: '123456',
        userId,
        isVerified: false,
        attempts: 0,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      };

      mockPhoneVerificationRepository.findOne.mockResolvedValue(mockVerification);
      mockRedisService.get.mockResolvedValue('2'); // Under limit
      
      jest.spyOn(service as any, 'generateVerificationCode').mockReturnValue(newCode);
      mockSmsService.sendVerificationCode.mockResolvedValue({ success: true });

      const result = await service.resendVerificationCode(userId);

      expect(mockPhoneVerificationRepository.update).toHaveBeenCalledWith(
        { id: mockVerification.id },
        {
          verificationCode: newCode,
          attempts: 0,
          expiresAt: expect.any(Date),
        }
      );
      expect(mockSmsService.sendVerificationCode).toHaveBeenCalledWith(phoneNumber, newCode);
      expect(result).toEqual({
        success: true,
        message: 'New verification code sent',
        phoneNumber,
        expiresIn: 900,
      });
    });

    it('should throw NotFoundException if no pending verification', async () => {
      const userId = 1;
      
      mockPhoneVerificationRepository.findOne.mockResolvedValue(null);

      await expect(service.resendVerificationCode(userId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already verified', async () => {
      const userId = 1;
      
      const mockVerification = {
        id: 1,
        phoneNumber: '+1234567890',
        isVerified: true,
      };

      mockPhoneVerificationRepository.findOne.mockResolvedValue(mockVerification);

      await expect(service.resendVerificationCode(userId))
        .rejects.toThrow('Phone number is already verified');
    });

    it('should enforce resend rate limiting', async () => {
      const userId = 1;
      
      const mockVerification = {
        id: 1,
        phoneNumber: '+1234567890',
        isVerified: false,
      };

      mockPhoneVerificationRepository.findOne.mockResolvedValue(mockVerification);
      mockRedisService.get.mockResolvedValue('3'); // Max resends reached

      await expect(service.resendVerificationCode(userId))
        .rejects.toThrow(HttpException);
    });
  });

  describe('updatePhoneNumber', () => {
    it('should successfully update phone number for existing user', async () => {
      const userId = 1;
      const oldPhone = '+1234567890';
      const newPhone = '+0987654321';
      const verificationCode = '123456';

      const mockUser = {
        id: userId,
        phone: oldPhone,
        phoneVerified: true,
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockUsersService.findByPhone.mockResolvedValue(null);
      mockSmsService.validatePhoneNumber.mockReturnValue(true);
      mockSmsService.formatPhoneNumber.mockReturnValue(newPhone);
      mockRedisService.get.mockResolvedValue(null);
      
      const mockVerification = {
        id: 1,
        phoneNumber: newPhone,
        verificationCode,
        userId,
      };

      mockPhoneVerificationRepository.create.mockReturnValue(mockVerification);
      mockPhoneVerificationRepository.save.mockResolvedValue(mockVerification);
      mockSmsService.sendVerificationCode.mockResolvedValue({ success: true });

      jest.spyOn(service as any, 'generateVerificationCode').mockReturnValue(verificationCode);

      const result = await service.updatePhoneNumber(userId, newPhone);

      expect(mockSmsService.sendVerificationCode).toHaveBeenCalledWith(newPhone, verificationCode);
      expect(result).toEqual({
        success: true,
        message: 'Verification code sent to new phone number',
        phoneNumber: newPhone,
        requiresVerification: true,
      });
    });

    it('should throw BadRequestException if new phone is same as current', async () => {
      const userId = 1;
      const phone = '+1234567890';

      const mockUser = {
        id: userId,
        phone,
        phoneVerified: true,
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockSmsService.validatePhoneNumber.mockReturnValue(true);
      mockSmsService.formatPhoneNumber.mockReturnValue(phone);

      await expect(service.updatePhoneNumber(userId, phone))
        .rejects.toThrow('This is already your verified phone number');
    });
  });

  describe('generateVerificationCode', () => {
    it('should generate a 6-digit verification code', () => {
      const code = (service as any).generateVerificationCode();
      
      expect(code).toMatch(/^\d{6}$/);
      expect(code.length).toBe(6);
    });

    it('should generate different codes on subsequent calls', () => {
      const codes = new Set();
      
      for (let i = 0; i < 10; i++) {
        codes.add((service as any).generateVerificationCode());
      }
      
      expect(codes.size).toBeGreaterThan(1);
    });
  });

  describe('getVerificationStatus', () => {
    it('should return verification status for user', async () => {
      const userId = 1;
      
      const mockVerification = {
        id: 1,
        phoneNumber: '+1234567890',
        isVerified: false,
        attempts: 2,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        createdAt: new Date(),
      };

      mockPhoneVerificationRepository.findOne.mockResolvedValue(mockVerification);

      const result = await service.getVerificationStatus(userId);

      expect(result).toEqual({
        hasActiveVerification: true,
        phoneNumber: '+1234567890',
        isVerified: false,
        attemptsRemaining: 3, // 5 - 2
        expiresAt: mockVerification.expiresAt,
      });
    });

    it('should return no active verification status', async () => {
      const userId = 1;
      
      mockPhoneVerificationRepository.findOne.mockResolvedValue(null);

      const result = await service.getVerificationStatus(userId);

      expect(result).toEqual({
        hasActiveVerification: false,
      });
    });
  });
});