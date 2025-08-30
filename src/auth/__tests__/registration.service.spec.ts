import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { RegistrationService } from '../registration.service';
import { UsersService } from '../../users/users.service';
import { EmailService } from '../../services/email.service';
import { User } from '../../users/entities/user.entity';
import { UserVerification } from '../entities/user-verification.entity';
import { RegisterDto } from '../dto/register.dto';
import { VerificationType } from '../../common/enums/verification-type.enum';
import { AccountStatus } from '../../common/enums/account-status.enum';

describe('RegistrationService', () => {
  let service: RegistrationService;
  let usersService: UsersService;
  let emailService: EmailService;
  let verificationRepository: Repository<UserVerification>;

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockEmailService = {
    sendVerificationEmail: jest.fn(),
  };

  const mockVerificationRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: getRepositoryToken(UserVerification),
          useValue: mockVerificationRepository,
        },
      ],
    }).compile();

    service = module.get<RegistrationService>(RegistrationService);
    usersService = module.get<UsersService>(UsersService);
    emailService = module.get<EmailService>(EmailService);
    verificationRepository = module.get<Repository<UserVerification>>(getRepositoryToken(UserVerification));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateRegistration', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      password: 'Test123!@#',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should successfully initiate user registration', async () => {
      const mockUser = {
        id: 1,
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        accountStatus: AccountStatus.PENDING_VERIFICATION,
        emailVerified: false,
      };

      const mockVerification = {
        id: 1,
        userId: mockUser.id,
        verificationType: VerificationType.EMAIL,
        verificationValue: registerDto.email,
        verificationCode: '123456',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        attempts: 0,
      };

      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(mockUser);
      mockVerificationRepository.create.mockReturnValue(mockVerification);
      mockVerificationRepository.save.mockResolvedValue(mockVerification);
      mockEmailService.sendVerificationEmail.mockResolvedValue(undefined);

      // Mock the generateVerificationCode method to return a predictable value
      jest.spyOn(service, 'generateVerificationCode').mockReturnValue('123456');

      const result = await service.initiateRegistration(registerDto);

      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(mockUsersService.create).toHaveBeenCalledWith({
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        passwordHash: expect.any(String),
      });
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        registerDto.email,
        '123456'
      );
      expect(result).toEqual({
        success: true,
        message: 'Registration initiated. Please check your email for verification code.',
        userId: mockUser.id,
      });
    });

    it('should throw ConflictException if user already exists', async () => {
      const existingUser = { id: 1, email: registerDto.email };
      mockUsersService.findByEmail.mockResolvedValue(existingUser);

      await expect(service.initiateRegistration(registerDto)).rejects.toThrow(ConflictException);
      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
    });
  });

  describe('verifyEmail', () => {
    it('should successfully verify email with correct code', async () => {
      const email = 'test@example.com';
      const verificationCode = '123456';
      const mockUser = {
        id: 1,
        email,
        accountStatus: AccountStatus.PENDING_VERIFICATION,
        emailVerified: false,
      };

      const mockVerification = {
        id: 1,
        userId: mockUser.id,
        verificationType: VerificationType.EMAIL,
        verificationValue: email,
        verificationCode,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        attempts: 0,
        verifiedAt: null,
        canAttempt: true,
        isExpired: false,
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockVerificationRepository.findOne.mockResolvedValue(mockVerification);
      mockVerificationRepository.save.mockResolvedValue({
        ...mockVerification,
        verifiedAt: new Date(),
      });
      mockUsersService.update.mockResolvedValue({
        ...mockUser,
        emailVerified: true,
        accountStatus: AccountStatus.ACTIVE,
      });

      const result = await service.verifyEmail(email, verificationCode);

      expect(result).toEqual({
        success: true,
        message: 'Email verified successfully',
        emailVerified: true,
      });
    });

    it('should throw BadRequestException for invalid verification code', async () => {
      const email = 'test@example.com';
      const verificationCode = 'wrong123';
      const mockUser = { id: 1, email };

      const mockVerification = {
        id: 1,
        userId: mockUser.id,
        verificationCode: '123456', // Different code
        canAttempt: true,
        isExpired: false,
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockVerificationRepository.findOne.mockResolvedValue(mockVerification);

      await expect(service.verifyEmail(email, verificationCode)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired verification code', async () => {
      const email = 'test@example.com';
      const verificationCode = '123456';
      const mockUser = { id: 1, email };

      const mockVerification = {
        id: 1,
        userId: mockUser.id,
        verificationCode,
        canAttempt: false,
        isExpired: true,
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockVerificationRepository.findOne.mockResolvedValue(mockVerification);

      await expect(service.verifyEmail(email, verificationCode)).rejects.toThrow(BadRequestException);
    });
  });

  describe('resendVerificationEmail', () => {
    it('should successfully resend verification email', async () => {
      const email = 'test@example.com';
      const mockUser = {
        id: 1,
        email,
        emailVerified: false,
      };

      const newVerification = {
        id: 2,
        userId: mockUser.id,
        verificationType: VerificationType.EMAIL,
        verificationValue: email,
        verificationCode: '654321',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockVerificationRepository.create.mockReturnValue(newVerification);
      mockVerificationRepository.save.mockResolvedValue(newVerification);
      mockEmailService.sendVerificationEmail.mockResolvedValue(undefined);

      // Mock the generateVerificationCode method to return a predictable value
      jest.spyOn(service, 'generateVerificationCode').mockReturnValue('654321');

      const result = await service.resendVerificationEmail(email);

      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        email,
        '654321'
      );
      expect(result).toEqual({
        success: true,
        message: 'Verification email sent',
      });
    });

    it('should throw BadRequestException if email is already verified', async () => {
      const email = 'test@example.com';
      const mockUser = {
        id: 1,
        email,
        emailVerified: true, // Already verified
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.resendVerificationEmail(email)).rejects.toThrow(BadRequestException);
    });
  });

  describe('generateVerificationCode', () => {
    it('should generate a 6-digit verification code', () => {
      const code = service.generateVerificationCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(code.length).toBe(6);
    });

    it('should generate unique codes', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(service.generateVerificationCode());
      }
      // Should generate mostly unique codes (allowing some duplicates due to randomness)
      expect(codes.size).toBeGreaterThan(80);
    });
  });
});