import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { ProfileService } from '../profile.service';
import { UsersService } from '../users.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { AuditLogService } from '../../services/audit-log.service';
import { User } from '../entities/user.entity';
import { UpdateUserDto } from '../dto/update-user.dto';
import { AccountStatus } from '../../common/enums/account-status.enum';

describe('ProfileService', () => {
  let service: ProfileService;
  let usersService: UsersService;
  let imageUploadService: ImageUploadService;
  let auditLogService: AuditLogService;

  const mockUsersService = {
    findOne: jest.fn(),
    update: jest.fn(),
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
  };

  const mockImageUploadService = {
    uploadProfileImage: jest.fn(),
    deleteImage: jest.fn(),
    validateImageFile: jest.fn(),
    resizeImage: jest.fn(),
  };

  const mockAuditLogService = {
    logProfileUpdate: jest.fn(),
    logImageUpload: jest.fn(),
    logImageDelete: jest.fn(),
    logDataExport: jest.fn(),
    logAccountDeactivation: jest.fn(),
    logAccountReactivation: jest.fn(),
  };

  const mockUser: Partial<User> = {
    id: 1,
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    profileImageUrl: null,
    locationText: 'New York, NY',
    emailVerified: true,
    phoneVerified: false,
    accountStatus: AccountStatus.ACTIVE,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: ImageUploadService,
          useValue: mockImageUploadService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
    usersService = module.get<UsersService>(UsersService);
    imageUploadService = module.get<ImageUploadService>(ImageUploadService);
    auditLogService = module.get<AuditLogService>(AuditLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateProfile', () => {
    it('should successfully update user profile', async () => {
      const userId = 1;
      const updateData: UpdateUserDto = {
        firstName: 'Jane',
        lastName: 'Smith',
        locationText: 'San Francisco, CA',
      };

      const updatedUser = { ...mockUser, ...updateData };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockUsersService.update.mockResolvedValue(updatedUser);

      const result = await service.updateProfile(userId, updateData);

      expect(mockUsersService.update).toHaveBeenCalledWith(userId, updateData);
      expect(mockAuditLogService.logProfileUpdate).toHaveBeenCalledWith(
        userId,
        updateData,
        expect.any(String), // IP address
      );
      expect(result).toEqual({
        success: true,
        message: 'Profile updated successfully',
        user: updatedUser,
      });
    });

    it('should throw NotFoundException for non-existent user', async () => {
      const userId = 999;
      const updateData: UpdateUserDto = { firstName: 'Jane' };

      mockUsersService.findOne.mockRejectedValue(new NotFoundException('User not found'));

      await expect(service.updateProfile(userId, updateData))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when updating to existing email', async () => {
      const userId = 1;
      const updateData: UpdateUserDto = { email: 'existing@example.com' };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockUsersService.findByEmail.mockResolvedValue({ id: 2, email: 'existing@example.com' });

      await expect(service.updateProfile(userId, updateData))
        .rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when updating to existing phone', async () => {
      const userId = 1;
      const updateData: UpdateUserDto = { phone: '+1234567890' };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockUsersService.findByPhone.mockResolvedValue({ id: 2, phone: '+1234567890' });

      await expect(service.updateProfile(userId, updateData))
        .rejects.toThrow(ConflictException);
    });

    it('should allow updating to same email/phone for same user', async () => {
      const userId = 1;
      const updateData: UpdateUserDto = { 
        email: 'test@example.com',
        phone: '+1234567890',
        firstName: 'John Updated',
      };

      const userWithPhone = { ...mockUser, phone: '+1234567890' };
      const updatedUser = { ...userWithPhone, ...updateData };

      mockUsersService.findOne.mockResolvedValue(userWithPhone);
      mockUsersService.findByEmail.mockResolvedValue(userWithPhone);
      mockUsersService.findByPhone.mockResolvedValue(userWithPhone);
      mockUsersService.update.mockResolvedValue(updatedUser);

      const result = await service.updateProfile(userId, updateData);

      expect(result.success).toBe(true);
      expect(mockUsersService.update).toHaveBeenCalledWith(userId, updateData);
    });
  });

  describe('uploadProfileImage', () => {
    it('should successfully upload profile image', async () => {
      const userId = 1;
      const imageFile = {
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        originalname: 'profile.jpg',
        size: 1024000, // 1MB
      } as any;

      const imageUrl = 'https://s3.amazonaws.com/bucket/profile-images/user-1.jpg';
      const updatedUser = { ...mockUser, profileImageUrl: imageUrl };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockImageUploadService.validateImageFile.mockReturnValue(true);
      mockImageUploadService.uploadProfileImage.mockResolvedValue(imageUrl);
      mockUsersService.update.mockResolvedValue(updatedUser);

      const result = await service.uploadProfileImage(userId, imageFile);

      expect(mockImageUploadService.validateImageFile).toHaveBeenCalledWith(imageFile);
      expect(mockImageUploadService.uploadProfileImage).toHaveBeenCalledWith(userId, imageFile);
      expect(mockUsersService.update).toHaveBeenCalledWith(userId, { profileImageUrl: imageUrl });
      expect(mockAuditLogService.logImageUpload).toHaveBeenCalledWith(userId, imageUrl);
      expect(result).toEqual({
        success: true,
        message: 'Profile image uploaded successfully',
        imageUrl,
      });
    });

    it('should delete old profile image when uploading new one', async () => {
      const userId = 1;
      const oldImageUrl = 'https://s3.amazonaws.com/bucket/old-image.jpg';
      const userWithImage = { ...mockUser, profileImageUrl: oldImageUrl };
      const imageFile = {
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        originalname: 'new-profile.jpg',
        size: 1024000,
      } as any;

      const newImageUrl = 'https://s3.amazonaws.com/bucket/new-image.jpg';

      mockUsersService.findOne.mockResolvedValue(userWithImage);
      mockImageUploadService.validateImageFile.mockReturnValue(true);
      mockImageUploadService.uploadProfileImage.mockResolvedValue(newImageUrl);
      mockImageUploadService.deleteImage.mockResolvedValue(true);
      mockUsersService.update.mockResolvedValue({ ...userWithImage, profileImageUrl: newImageUrl });

      const result = await service.uploadProfileImage(userId, imageFile);

      expect(mockImageUploadService.deleteImage).toHaveBeenCalledWith(oldImageUrl);
      expect(result.success).toBe(true);
      expect(result.imageUrl).toBe(newImageUrl);
    });

    it('should throw BadRequestException for invalid image file', async () => {
      const userId = 1;
      const invalidFile = {
        buffer: Buffer.from('not-an-image'),
        mimetype: 'text/plain',
        originalname: 'not-image.txt',
        size: 1024,
      } as any;

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockImageUploadService.validateImageFile.mockReturnValue(false);

      await expect(service.uploadProfileImage(userId, invalidFile))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for oversized image', async () => {
      const userId = 1;
      const largeFile = {
        buffer: Buffer.alloc(10 * 1024 * 1024), // 10MB
        mimetype: 'image/jpeg',
        originalname: 'large.jpg',
        size: 10 * 1024 * 1024,
      } as any;

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockImageUploadService.validateImageFile.mockReturnValue(false);

      await expect(service.uploadProfileImage(userId, largeFile))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteProfileImage', () => {
    it('should successfully delete profile image', async () => {
      const userId = 1;
      const imageUrl = 'https://s3.amazonaws.com/bucket/profile.jpg';
      const userWithImage = { ...mockUser, profileImageUrl: imageUrl };

      mockUsersService.findOne.mockResolvedValue(userWithImage);
      mockImageUploadService.deleteImage.mockResolvedValue(true);
      mockUsersService.update.mockResolvedValue({ ...userWithImage, profileImageUrl: null });

      const result = await service.deleteProfileImage(userId);

      expect(mockImageUploadService.deleteImage).toHaveBeenCalledWith(imageUrl);
      expect(mockUsersService.update).toHaveBeenCalledWith(userId, { profileImageUrl: null });
      expect(mockAuditLogService.logImageDelete).toHaveBeenCalledWith(userId, imageUrl);
      expect(result).toEqual({
        success: true,
        message: 'Profile image deleted successfully',
      });
    });

    it('should handle case when user has no profile image', async () => {
      const userId = 1;

      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await service.deleteProfileImage(userId);

      expect(mockImageUploadService.deleteImage).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'No profile image to delete',
      });
    });
  });

  describe('getProfile', () => {
    it('should return complete user profile', async () => {
      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await service.getProfile(1);

      expect(result).toEqual({
        success: true,
        user: mockUser,
        profileCompletion: {
          percentage: expect.any(Number),
          missingFields: expect.any(Array),
        },
      });
    });

    it('should calculate profile completion percentage', async () => {
      const incompleteUser = {
        ...mockUser,
        profileImageUrl: null,
        locationText: null,
        phoneVerified: false,
      };

      mockUsersService.findOne.mockResolvedValue(incompleteUser);

      const result = await service.getProfile(1);

      expect(result.profileCompletion.percentage).toBeLessThan(100);
      expect(result.profileCompletion.missingFields).toContain('profileImage');
      expect(result.profileCompletion.missingFields).toContain('location');
      expect(result.profileCompletion.missingFields).toContain('phoneVerification');
    });
  });

  describe('exportUserData', () => {
    it('should export user data in JSON format', async () => {
      const userId = 1;
      const exportData = {
        profile: mockUser,
        sessions: [],
        socialAccounts: [],
        auditLogs: [],
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      jest.spyOn(service as any, 'gatherUserData').mockResolvedValue(exportData);

      const result = await service.exportUserData(userId, 'json');

      expect(result).toEqual({
        success: true,
        format: 'json',
        data: exportData,
        exportedAt: expect.any(Date),
      });
    });

    it('should export user data in CSV format', async () => {
      const userId = 1;
      const csvData = 'id,email,firstName,lastName\n1,test@example.com,John,Doe';

      mockUsersService.findOne.mockResolvedValue(mockUser);
      jest.spyOn(service as any, 'gatherUserData').mockResolvedValue({ profile: mockUser });
      jest.spyOn(service as any, 'convertToCSV').mockReturnValue(csvData);

      const result = await service.exportUserData(userId, 'csv');

      expect(result).toEqual({
        success: true,
        format: 'csv',
        data: csvData,
        exportedAt: expect.any(Date),
      });
    });
  });

  describe('deactivateAccount', () => {
    it('should successfully deactivate user account', async () => {
      const userId = 1;
      const reason = 'User requested account deactivation';

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockUsersService.update.mockResolvedValue({
        ...mockUser,
        accountStatus: AccountStatus.DEACTIVATED,
        deactivatedAt: new Date(),
      });

      const result = await service.deactivateAccount(userId, reason);

      expect(mockUsersService.update).toHaveBeenCalledWith(userId, {
        accountStatus: AccountStatus.DEACTIVATED,
        deactivatedAt: expect.any(Date),
        deactivationReason: reason,
      });
      expect(result).toEqual({
        success: true,
        message: 'Account deactivated successfully',
        deactivatedAt: expect.any(Date),
      });
    });

    it('should throw BadRequestException for already deactivated account', async () => {
      const userId = 1;
      const deactivatedUser = { ...mockUser, accountStatus: AccountStatus.DEACTIVATED };

      mockUsersService.findOne.mockResolvedValue(deactivatedUser);

      await expect(service.deactivateAccount(userId, 'test'))
        .rejects.toThrow('Account is already deactivated');
    });
  });

  describe('reactivateAccount', () => {
    it('should successfully reactivate user account', async () => {
      const userId = 1;
      const deactivatedUser = {
        ...mockUser,
        accountStatus: AccountStatus.DEACTIVATED,
        deactivatedAt: new Date(),
      };

      mockUsersService.findOne.mockResolvedValue(deactivatedUser);
      mockUsersService.update.mockResolvedValue({
        ...deactivatedUser,
        accountStatus: AccountStatus.ACTIVE,
        reactivatedAt: new Date(),
      });

      const result = await service.reactivateAccount(userId);

      expect(mockUsersService.update).toHaveBeenCalledWith(userId, {
        accountStatus: AccountStatus.ACTIVE,
        reactivatedAt: expect.any(Date),
        deactivationReason: null,
      });
      expect(result).toEqual({
        success: true,
        message: 'Account reactivated successfully',
        reactivatedAt: expect.any(Date),
      });
    });

    it('should throw BadRequestException for already active account', async () => {
      const userId = 1;

      mockUsersService.findOne.mockResolvedValue(mockUser);

      await expect(service.reactivateAccount(userId))
        .rejects.toThrow('Account is already active');
    });
  });
});