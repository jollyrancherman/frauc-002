import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { EmailService } from '../services/email.service';
import { SocialAuthProvider } from './entities/social-auth-provider.entity';
import { User } from '../users/entities/user.entity';
import { OAuthProvider } from '../common/enums/oauth-provider.enum';
import { AccountStatus } from '../common/enums/account-status.enum';

export interface SocialAuthResult {
  user: Partial<User>;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
  isNewUser: boolean;
}

export interface ProfileData {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  constructor(
    @InjectRepository(SocialAuthProvider)
    private socialProviderRepository: Repository<SocialAuthProvider>,
    private usersService: UsersService,
    private authService: AuthService,
    private emailService: EmailService,
  ) {}

  async handleOAuthLogin(profile: any, provider: OAuthProvider): Promise<SocialAuthResult> {
    try {
      const profileData = this.extractProfileData(profile);
      
      if (!profileData.email) {
        throw new Error(`Email is required from ${provider} OAuth provider`);
      }

    // Check if this social account is already linked
    const existingSocialAccount = await this.socialProviderRepository.findOne({
      where: {
        providerName: provider,
        providerUserId: profile.id,
      },
      relations: ['user'],
    });

    // If social account exists, login the user
    if (existingSocialAccount) {
      existingSocialAccount.updateLastUsed();
      await this.socialProviderRepository.save(existingSocialAccount);

      const tokens = await this.authService.generateTokens(existingSocialAccount.user);
      
      return {
        user: this.authService.sanitizeUser(existingSocialAccount.user),
        tokens,
        isNewUser: false,
      };
    }

    // Check if user exists by email
    let user = await this.usersService.findByEmail(profileData.email);
    let isNewUser = false;

    if (user) {
      // Check if this provider is already linked to a different user
      const providerLinkedToOtherUser = await this.socialProviderRepository.findOne({
        where: {
          providerName: provider,
          providerUserId: profile.id,
        },
        relations: ['user'],
      });

      if (providerLinkedToOtherUser && providerLinkedToOtherUser.userId !== user.id) {
        throw new ConflictException(
          `This ${provider} account is already linked to another user`
        );
      }
    } else {
      // Create new user
      user = await this.usersService.create({
        email: profileData.email,
        firstName: profileData.firstName || 'User',
        lastName: profileData.lastName || '',
        profileImageUrl: profileData.profileImageUrl,
        emailVerified: true, // OAuth emails are considered verified
        accountStatus: AccountStatus.ACTIVE,
      });

      isNewUser = true;

      // Send welcome email for new users
      try {
        await this.emailService.sendWelcomeEmail(user.email, user.firstName);
      } catch (error) {
        this.logger.error('Failed to send welcome email', error);
      }
    }

    // Create social provider link
    const socialProvider = this.socialProviderRepository.create({
      userId: user.id,
      providerName: provider,
      providerUserId: profile.id,
      providerEmail: profileData.email,
      providerData: profile,
      lastUsedAt: new Date(),
    });

    await this.socialProviderRepository.save(socialProvider);

    // Generate tokens
    const tokens = await this.authService.generateTokens(user);

      return {
        user: this.authService.sanitizeUser(user),
        tokens,
        isNewUser,
      };
    } catch (error) {
      this.logger.error(`OAuth login failed for ${provider}`, error);
      
      // Fallback mechanisms
      if (error.message.includes('Email is required')) {
        throw new Error(`${provider} authentication failed: Email permission is required. Please try again and grant email access.`);
      }
      
      if (error instanceof ConflictException) {
        throw error; // Re-throw conflict exceptions as they need specific handling
      }
      
      // General fallback for other errors
      throw new Error(`${provider} authentication failed. Please try again or use email registration.`);
    }
  }

  async disconnectSocialAccount(userId: number, provider: OAuthProvider): Promise<{
    success: boolean;
    message: string;
  }> {
    const socialProvider = await this.socialProviderRepository.findOne({
      where: { userId, providerName: provider },
    });

    if (!socialProvider) {
      throw new NotFoundException('Social account not found');
    }

    await this.socialProviderRepository.remove(socialProvider);

    return {
      success: true,
      message: 'Social account disconnected successfully',
    };
  }

  async getUserSocialAccounts(userId: number): Promise<Partial<SocialAuthProvider>[]> {
    return await this.socialProviderRepository.find({
      where: { userId },
      select: ['id', 'providerName', 'providerEmail', 'connectedAt', 'lastUsedAt'],
    });
  }

  extractProfileData(profile: any): ProfileData {
    return {
      email: profile.emails?.length > 0 ? profile.emails[0].value : null,
      firstName: profile.name?.givenName || null,
      lastName: profile.name?.familyName || null,
      profileImageUrl: profile.photos?.length > 0 ? profile.photos[0].value : null,
    };
  }

  async linkSocialAccount(
    userId: number,
    profile: any,
    provider: OAuthProvider
  ): Promise<{ success: boolean; message: string }> {
    // Check if this social account is already linked to another user
    const existingSocialAccount = await this.socialProviderRepository.findOne({
      where: {
        providerName: provider,
        providerUserId: profile.id,
      },
    });

    if (existingSocialAccount && existingSocialAccount.userId !== userId) {
      throw new ConflictException(
        `This ${provider} account is already linked to another user`
      );
    }

    if (existingSocialAccount && existingSocialAccount.userId === userId) {
      return {
        success: true,
        message: 'Social account is already linked to your account',
      };
    }

    // Create the link
    const profileData = this.extractProfileData(profile);
    const socialProvider = this.socialProviderRepository.create({
      userId,
      providerName: provider,
      providerUserId: profile.id,
      providerEmail: profileData.email,
      providerData: profile,
      lastUsedAt: new Date(),
    });

    await this.socialProviderRepository.save(socialProvider);

    return {
      success: true,
      message: `${provider} account linked successfully`,
    };
  }
}