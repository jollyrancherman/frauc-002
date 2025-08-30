import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PasswordRecoveryService } from '../password-recovery.service';
import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';
import { EmailService } from '../../services/email.service';
import { SmsService } from '../../services/sms.service';
import { AuditLogService } from '../../services/audit-log.service';
import { RedisService } from '../../config/redis.config';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { User } from '../../users/entities/user.entity';

describe('PasswordRecoveryService', () => {
  let service: PasswordRecoveryService;
  let authService: AuthService;
  let usersService: UsersService;
  let emailService: EmailService;
  let smsService: SmsService;
  let auditLogService: AuditLogService;
  let redisService: RedisService;
  let passwordResetRepository: Repository<PasswordResetToken>;

  const mockAuthService = {
    hashPassword: jest.fn(),
    generateTokens: jest.fn(),
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockEmailService = {
    sendPasswordResetEmail: jest.fn(),
  };

  const mockSmsService = {
    sendMessage: jest.fn(),
    validatePhoneNumber: jest.fn(),
    formatPhoneNumber: jest.fn(),
  };

  const mockAuditLogService = {
    logPasswordResetRequest: jest.fn(),
    logPasswordResetSuccess: jest.fn(),
    logPasswordResetAttempt: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  };

  const mockPasswordResetRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockUser: Partial<User> = {
    id: 1,
    email: 'test@example.com',
    phone: '+1234567890',
    firstName: 'John',
    lastName: 'Doe',
    emailVerified: true,
    phoneVerified: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordRecoveryService,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: SmsService,
          useValue: mockSmsService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: mockPasswordResetRepository,
        },
      ],
    }).compile();

    service = module.get<PasswordRecoveryService>(PasswordRecoveryService);
    authService = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    emailService = module.get<EmailService>(EmailService);
    smsService = module.get<SmsService>(SmsService);
    auditLogService = module.get<AuditLogService>(AuditLogService);
    redisService = module.get<RedisService>(RedisService);
    passwordResetRepository = module.get<Repository<PasswordResetToken>>(
      getRepositoryToken(PasswordResetToken),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initiatePasswordReset', () => {
    it('should successfully initiate password reset via email', async () => {
      const email = 'test@example.com';
      const resetToken = 'secure-reset-token-123';
      const resetCode = '123456';

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockRedisService.get.mockResolvedValue(null); // No rate limit
      
      const mockToken = {
        id: 1,
        userId: mockUser.id,
        token: resetToken,
        resetCode,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        method: 'email',
      };

      mockPasswordResetRepository.create.mockReturnValue(mockToken);
      mockPasswordResetRepository.save.mockResolvedValue(mockToken);
      mockEmailService.sendPasswordResetEmail.mockResolvedValue({ success: true });

      jest.spyOn(service as any, 'generateResetToken').mockReturnValue(resetToken);
      jest.spyOn(service as any, 'generateResetCode').mockReturnValue(resetCode);

      const result = await service.initiatePasswordReset(email, 'email');

      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        email,
        resetCode,
        mockUser.firstName,
      );
      expect(mockAuditLogService.logPasswordResetRequest).toHaveBeenCalledWith(
        mockUser.id,
        'email',
        expect.any(String),
      );
      expect(result).toEqual({
        success: true,
        message: 'Password reset code sent to your email',
        method: 'email',
        expiresIn: 3600,
      });
    });

    it('should successfully initiate password reset via SMS', async () => {
      const phone = '+1234567890';
      const resetToken = 'secure-reset-token-456';
      const resetCode = '654321';

      mockSmsService.validatePhoneNumber.mockReturnValue(true);
      mockSmsService.formatPhoneNumber.mockReturnValue(phone);
      mockUsersService.findByPhone.mockResolvedValue(mockUser);
      mockRedisService.get.mockResolvedValue(null);
      
      const mockToken = {
        id: 1,
        userId: mockUser.id,
        token: resetToken,
        resetCode,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        method: 'sms',
      };

      mockPasswordResetRepository.create.mockReturnValue(mockToken);
      mockPasswordResetRepository.save.mockResolvedValue(mockToken);
      mockSmsService.sendMessage.mockResolvedValue({ success: true });

      jest.spyOn(service as any, 'generateResetToken').mockReturnValue(resetToken);
      jest.spyOn(service as any, 'generateResetCode').mockReturnValue(resetCode);

      const result = await service.initiatePasswordReset(phone, 'sms');

      expect(mockSmsService.sendMessage).toHaveBeenCalledWith(
        phone,
        expect.stringContaining(resetCode),
        true, // isTransactional
      );
      expect(result.method).toBe('sms');
    });

    it('should throw NotFoundException for non-existent user', async () => {
      const email = 'nonexistent@example.com';

      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.initiatePasswordReset(email, 'email'))
        .rejects.toThrow(NotFoundException);
    });

    it('should enforce rate limiting', async () => {
      const email = 'test@example.com';

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockRedisService.get.mockResolvedValue('3'); // Max attempts reached

      await expect(service.initiatePasswordReset(email, 'email'))
        .rejects.toThrow('Too many password reset requests');
    });
  });

  describe('resetPassword', () => {
    it('should successfully reset password with valid token and code', async () => {
      const resetCode = '123456';
      const newPassword = 'NewSecurePassword123!';
      const hashedPassword = 'hashed-new-password';

      const mockToken = {
        id: 1,
        userId: mockUser.id,
        resetCode,
        isExpired: false,
        attempts: 0,
        method: 'email',
        user: mockUser,
      };

      mockPasswordResetRepository.findOne.mockResolvedValue(mockToken);
      mockAuthService.hashPassword.mockResolvedValue(hashedPassword);
      mockUsersService.update.mockResolvedValue({
        ...mockUser,
        passwordHash: hashedPassword,
      });
      mockAuthService.generateTokens.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const result = await service.resetPassword(resetCode, newPassword);

      expect(mockUsersService.update).toHaveBeenCalledWith(mockUser.id, {
        passwordHash: hashedPassword,
      });
      expect(mockPasswordResetRepository.update).toHaveBeenCalledWith(
        { id: mockToken.id },
        { isUsed: true, usedAt: expect.any(Date) },
      );
      expect(mockAuditLogService.logPasswordResetSuccess).toHaveBeenCalledWith(
        mockUser.id,
        mockToken.method,
      );
      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
    });

    it('should throw BadRequestException for invalid reset code', async () => {
      const resetCode = '999999';
      const newPassword = 'NewPassword123!';

      mockPasswordResetRepository.findOne.mockResolvedValue(null);

      await expect(service.resetPassword(resetCode, newPassword))
        .rejects.toThrow('Invalid or expired reset code');
    });

    it('should throw BadRequestException for expired token', async () => {
      const resetCode = '123456';
      const newPassword = 'NewPassword123!';

      const mockToken = {
        id: 1,
        userId: mockUser.id,
        resetCode,
        isExpired: true,
        attempts: 0,
      };

      mockPasswordResetRepository.findOne.mockResolvedValue(mockToken);

      await expect(service.resetPassword(resetCode, newPassword))
        .rejects.toThrow('Reset code has expired');
    });

    it('should throw BadRequestException after max attempts', async () => {
      const resetCode = '123456';
      const newPassword = 'NewPassword123!';

      const mockToken = {
        id: 1,
        userId: mockUser.id,
        resetCode: '654321', // Different code
        isExpired: false,
        attempts: 4, // Already at max
      };

      mockPasswordResetRepository.findOne.mockResolvedValue(mockToken);

      await expect(service.resetPassword(resetCode, newPassword))
        .rejects.toThrow('Maximum reset attempts exceeded');
    });
  });

  describe('validateResetCode', () => {
    it('should validate correct reset code', async () => {
      const resetCode = '123456';

      const mockToken = {
        id: 1,
        userId: mockUser.id,
        resetCode,
        isExpired: false,
        attempts: 0,
        user: mockUser,
      };

      mockPasswordResetRepository.findOne.mockResolvedValue(mockToken);

      const result = await service.validateResetCode(resetCode);

      expect(result).toEqual({
        isValid: true,
        userId: mockUser.id,
        method: mockToken.method,
        attemptsRemaining: 5,
      });
    });

    it('should return invalid for non-existent code', async () => {
      const resetCode = '999999';

      mockPasswordResetRepository.findOne.mockResolvedValue(null);

      const result = await service.validateResetCode(resetCode);

      expect(result).toEqual({
        isValid: false,
        error: 'Invalid reset code',
      });
    });
  });
});