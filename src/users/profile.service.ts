import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { ImageUploadService } from '../services/image-upload.service';
import { AuditLogService } from '../services/audit-log.service';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { AccountStatus } from '../common/enums/account-status.enum';

export interface ProfileUpdateResult {
  success: boolean;
  message: string;
  user?: Partial<User>;
}

export interface ImageUploadResult {
  success: boolean;
  message: string;
  imageUrl?: string;
}

export interface ProfileResponse {
  success: boolean;
  user: Partial<User>;
  profileCompletion: {
    percentage: number;
    missingFields: string[];
  };
}

export interface AccountStatusResult {
  success: boolean;
  message: string;
  deactivatedAt?: Date;
  reactivatedAt?: Date;
}

export interface DataExportResult {
  success: boolean;
  format: 'json' | 'csv';
  data: any;
  exportedAt: Date;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private usersService: UsersService,
    private imageUploadService: ImageUploadService,
    private auditLogService: AuditLogService,
  ) {}

  async getProfile(userId: number): Promise<ProfileResponse> {
    const user = await this.usersService.findOne(userId);
    
    const profileCompletion = this.calculateProfileCompletion(user);
    
    return {
      success: true,
      user: this.sanitizeUserForResponse(user),
      profileCompletion,
    };
  }

  async updateProfile(
    userId: number,
    updateData: UpdateUserDto,
    ipAddress?: string,
  ): Promise<ProfileUpdateResult> {
    const user = await this.usersService.findOne(userId);

    // Validate email uniqueness if being updated
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await this.usersService.findByEmail(updateData.email);
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Email is already in use');
      }
    }

    // Validate phone uniqueness if being updated
    if (updateData.phone && updateData.phone !== user.phone) {
      const existingUser = await this.usersService.findByPhone(updateData.phone);
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Phone number is already in use');
      }
    }

    // Update user profile
    const updatedUser = await this.usersService.update(userId, updateData);

    // Log the profile update
    await this.auditLogService.logProfileUpdate(userId, updateData, ipAddress || 'unknown');

    this.logger.log(`Profile updated for user ${userId}`);

    return {
      success: true,
      message: 'Profile updated successfully',
      user: this.sanitizeUserForResponse(updatedUser),
    };
  }

  async uploadProfileImage(userId: number, imageFile: Express.Multer.File): Promise<ImageUploadResult> {
    const user = await this.usersService.findOne(userId);

    // Validate image file
    if (!this.imageUploadService.validateImageFile(imageFile)) {
      throw new BadRequestException(
        'Invalid image file. Please upload a JPEG, PNG, or WebP image under 5MB.',
      );
    }

    try {
      // Delete old profile image if exists
      if (user.profileImageUrl) {
        await this.imageUploadService.deleteImage(user.profileImageUrl);
      }

      // Upload new image
      const imageUrl = await this.imageUploadService.uploadProfileImage(userId, imageFile);

      // Update user profile with new image URL
      await this.usersService.update(userId, { profileImageUrl: imageUrl });

      // Log the image upload
      await this.auditLogService.logImageUpload(userId, imageUrl);

      this.logger.log(`Profile image uploaded for user ${userId}`);

      return {
        success: true,
        message: 'Profile image uploaded successfully',
        imageUrl,
      };
    } catch (error) {
      this.logger.error(`Failed to upload profile image for user ${userId}`, error);
      throw new BadRequestException('Failed to upload image. Please try again.');
    }
  }

  async deleteProfileImage(userId: number): Promise<ImageUploadResult> {
    const user = await this.usersService.findOne(userId);

    if (!user.profileImageUrl) {
      return {
        success: true,
        message: 'No profile image to delete',
      };
    }

    try {
      // Delete image from S3
      await this.imageUploadService.deleteImage(user.profileImageUrl);

      // Update user profile
      await this.usersService.update(userId, { profileImageUrl: null });

      // Log the image deletion
      await this.auditLogService.logImageDelete(userId, user.profileImageUrl);

      this.logger.log(`Profile image deleted for user ${userId}`);

      return {
        success: true,
        message: 'Profile image deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to delete profile image for user ${userId}`, error);
      throw new BadRequestException('Failed to delete image. Please try again.');
    }
  }

  async deactivateAccount(userId: number, reason?: string): Promise<AccountStatusResult> {
    const user = await this.usersService.findOne(userId);

    if (user.accountStatus === AccountStatus.DEACTIVATED) {
      throw new BadRequestException('Account is already deactivated');
    }

    const deactivatedAt = new Date();

    await this.usersService.update(userId, {
      accountStatus: AccountStatus.DEACTIVATED,
      deactivatedAt,
      deactivationReason: reason || 'User requested deactivation',
    });

    // Log account deactivation
    await this.auditLogService.logAccountDeactivation(userId, reason || 'User requested');

    this.logger.log(`Account deactivated for user ${userId}`);

    return {
      success: true,
      message: 'Account deactivated successfully',
      deactivatedAt,
    };
  }

  async reactivateAccount(userId: number): Promise<AccountStatusResult> {
    const user = await this.usersService.findOne(userId);

    if (user.accountStatus !== AccountStatus.DEACTIVATED) {
      throw new BadRequestException('Account is already active');
    }

    const reactivatedAt = new Date();

    await this.usersService.update(userId, {
      accountStatus: AccountStatus.ACTIVE,
      reactivatedAt,
      deactivationReason: null,
    });

    // Log account reactivation
    await this.auditLogService.logAccountReactivation(userId);

    this.logger.log(`Account reactivated for user ${userId}`);

    return {
      success: true,
      message: 'Account reactivated successfully',
      reactivatedAt,
    };
  }

  async exportUserData(userId: number, format: 'json' | 'csv' = 'json'): Promise<DataExportResult> {
    const user = await this.usersService.findOne(userId);
    
    // Gather all user data for export
    const exportData = await this.gatherUserData(userId);

    // Log data export request
    await this.auditLogService.logDataExport(userId, format);

    this.logger.log(`Data export requested for user ${userId} in ${format} format`);

    if (format === 'csv') {
      const csvData = this.convertToCSV(exportData);
      return {
        success: true,
        format: 'csv',
        data: csvData,
        exportedAt: new Date(),
      };
    }

    return {
      success: true,
      format: 'json',
      data: exportData,
      exportedAt: new Date(),
    };
  }

  private calculateProfileCompletion(user: User): { percentage: number; missingFields: string[] } {
    const requiredFields = [
      { field: 'firstName', value: user.firstName },
      { field: 'lastName', value: user.lastName },
      { field: 'email', value: user.email },
      { field: 'emailVerification', value: user.emailVerified },
    ];

    const optionalFields = [
      { field: 'profileImage', value: user.profileImageUrl },
      { field: 'location', value: user.locationText },
      { field: 'phoneVerification', value: user.phoneVerified },
    ];

    const allFields = [...requiredFields, ...optionalFields];
    const completedFields = allFields.filter(field => !!field.value);
    const missingFields = allFields
      .filter(field => !field.value)
      .map(field => field.field);

    const percentage = Math.round((completedFields.length / allFields.length) * 100);

    return {
      percentage,
      missingFields,
    };
  }

  private sanitizeUserForResponse(user: User): Partial<User> {
    const { passwordHash, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  private async gatherUserData(userId: number): Promise<any> {
    const user = await this.usersService.findOne(userId);
    
    // In a real implementation, you would gather data from various related tables
    return {
      profile: this.sanitizeUserForResponse(user),
      sessions: [], // Would fetch from UserSession repository
      socialAccounts: [], // Would fetch from SocialAuthProvider repository
      phoneVerifications: [], // Would fetch from PhoneVerification repository
      emailVerifications: [], // Would fetch from UserVerification repository
      auditLogs: [], // Would fetch from AuditLog repository (non-sensitive entries only)
      exportMetadata: {
        exportedAt: new Date(),
        userId,
        version: '1.0',
      },
    };
  }

  private convertToCSV(data: any): string {
    // Simplified CSV conversion for profile data
    const profile = data.profile;
    const headers = Object.keys(profile).join(',');
    const values = Object.values(profile).map(value => 
      typeof value === 'string' ? `"${value}"` : value
    ).join(',');

    return `${headers}\n${values}`;
  }
}