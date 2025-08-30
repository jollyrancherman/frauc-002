import { Test, TestingModule } from '@nestjs/testing';
import { PhoneVerificationController } from '../phone-verification.controller';
import { PhoneVerificationService } from '../phone-verification.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';

describe('PhoneVerificationController', () => {
  let controller: PhoneVerificationController;
  let service: PhoneVerificationService;

  const mockPhoneVerificationService = {
    initiatePhoneVerification: jest.fn(),
    verifyPhone: jest.fn(),
    resendVerificationCode: jest.fn(),
    updatePhoneNumber: jest.fn(),
    getVerificationStatus: jest.fn(),
  };

  const mockUser: Partial<User> = {
    id: 1,
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PhoneVerificationController],
      providers: [
        {
          provide: PhoneVerificationService,
          useValue: mockPhoneVerificationService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PhoneVerificationController>(PhoneVerificationController);
    service = module.get<PhoneVerificationService>(PhoneVerificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/phone/initiate', () => {
    it('should initiate phone verification', async () => {
      const phoneNumber = '+1234567890';
      const mockResult = {
        success: true,
        message: 'Verification code sent to your phone',
        phoneNumber,
        expiresIn: 900,
      };

      mockPhoneVerificationService.initiatePhoneVerification.mockResolvedValue(mockResult);

      const result = await controller.initiatePhoneVerification(
        mockUser as User,
        { phoneNumber }
      );

      expect(mockPhoneVerificationService.initiatePhoneVerification).toHaveBeenCalledWith(
        mockUser.id,
        phoneNumber
      );
      expect(result).toEqual(mockResult);
    });

    it('should handle invalid phone number', async () => {
      const phoneNumber = 'invalid';
      
      mockPhoneVerificationService.initiatePhoneVerification.mockRejectedValue(
        new Error('Invalid phone number format')
      );

      await expect(
        controller.initiatePhoneVerification(mockUser as User, { phoneNumber })
      ).rejects.toThrow('Invalid phone number format');
    });
  });

  describe('POST /auth/phone/verify', () => {
    it('should verify phone with correct code', async () => {
      const verificationCode = '123456';
      const mockResult = {
        success: true,
        message: 'Phone number verified successfully',
        phoneNumber: '+1234567890',
      };

      mockPhoneVerificationService.verifyPhone.mockResolvedValue(mockResult);

      const result = await controller.verifyPhone(
        mockUser as User,
        { verificationCode }
      );

      expect(mockPhoneVerificationService.verifyPhone).toHaveBeenCalledWith(
        mockUser.id,
        verificationCode
      );
      expect(result).toEqual(mockResult);
    });

    it('should handle invalid verification code', async () => {
      const verificationCode = '000000';
      
      mockPhoneVerificationService.verifyPhone.mockRejectedValue(
        new Error('Invalid verification code')
      );

      await expect(
        controller.verifyPhone(mockUser as User, { verificationCode })
      ).rejects.toThrow('Invalid verification code');
    });
  });

  describe('POST /auth/phone/resend', () => {
    it('should resend verification code', async () => {
      const mockResult = {
        success: true,
        message: 'New verification code sent',
        phoneNumber: '+1234567890',
        expiresIn: 900,
      };

      mockPhoneVerificationService.resendVerificationCode.mockResolvedValue(mockResult);

      const result = await controller.resendVerificationCode(mockUser as User);

      expect(mockPhoneVerificationService.resendVerificationCode).toHaveBeenCalledWith(
        mockUser.id
      );
      expect(result).toEqual(mockResult);
    });

    it('should handle no pending verification', async () => {
      mockPhoneVerificationService.resendVerificationCode.mockRejectedValue(
        new Error('No pending verification found')
      );

      await expect(
        controller.resendVerificationCode(mockUser as User)
      ).rejects.toThrow('No pending verification found');
    });
  });

  describe('PUT /auth/phone/update', () => {
    it('should update phone number', async () => {
      const newPhoneNumber = '+0987654321';
      const mockResult = {
        success: true,
        message: 'Verification code sent to new phone number',
        phoneNumber: newPhoneNumber,
        requiresVerification: true,
      };

      mockPhoneVerificationService.updatePhoneNumber.mockResolvedValue(mockResult);

      const result = await controller.updatePhoneNumber(
        mockUser as User,
        { phoneNumber: newPhoneNumber }
      );

      expect(mockPhoneVerificationService.updatePhoneNumber).toHaveBeenCalledWith(
        mockUser.id,
        newPhoneNumber
      );
      expect(result).toEqual(mockResult);
    });

    it('should handle same phone number update', async () => {
      const phoneNumber = '+1234567890';
      
      mockPhoneVerificationService.updatePhoneNumber.mockRejectedValue(
        new Error('This is already your verified phone number')
      );

      await expect(
        controller.updatePhoneNumber(mockUser as User, { phoneNumber })
      ).rejects.toThrow('This is already your verified phone number');
    });
  });

  describe('GET /auth/phone/status', () => {
    it('should return verification status', async () => {
      const mockStatus = {
        hasActiveVerification: true,
        phoneNumber: '+1234567890',
        isVerified: false,
        attemptsRemaining: 3,
        expiresAt: new Date(),
      };

      mockPhoneVerificationService.getVerificationStatus.mockResolvedValue(mockStatus);

      const result = await controller.getVerificationStatus(mockUser as User);

      expect(mockPhoneVerificationService.getVerificationStatus).toHaveBeenCalledWith(
        mockUser.id
      );
      expect(result).toEqual(mockStatus);
    });

    it('should return no active verification status', async () => {
      const mockStatus = {
        hasActiveVerification: false,
      };

      mockPhoneVerificationService.getVerificationStatus.mockResolvedValue(mockStatus);

      const result = await controller.getVerificationStatus(mockUser as User);

      expect(result).toEqual(mockStatus);
    });
  });
});