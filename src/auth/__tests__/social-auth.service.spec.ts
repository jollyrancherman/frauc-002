import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SocialAuthService } from '../social-auth.service';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../auth.service';
import { EmailService } from '../../services/email.service';
import { SocialAuthProvider } from '../entities/social-auth-provider.entity';
import { User } from '../../users/entities/user.entity';
import { OAuthProvider } from '../../common/enums/oauth-provider.enum';
import { AccountStatus } from '../../common/enums/account-status.enum';

describe('SocialAuthService', () => {
  let service: SocialAuthService;
  let usersService: UsersService;
  let authService: AuthService;
  let emailService: EmailService;
  let socialProviderRepository: Repository<SocialAuthProvider>;

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockAuthService = {
    generateTokens: jest.fn(),
    createSession: jest.fn(),
    sanitizeUser: jest.fn(),
  };

  const mockEmailService = {
    sendWelcomeEmail: jest.fn(),
  };

  const mockSocialProviderRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialAuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: getRepositoryToken(SocialAuthProvider),
          useValue: mockSocialProviderRepository,
        },
      ],
    }).compile();

    service = module.get<SocialAuthService>(SocialAuthService);
    usersService = module.get<UsersService>(UsersService);
    authService = module.get<AuthService>(AuthService);
    emailService = module.get<EmailService>(EmailService);
    socialProviderRepository = module.get<Repository<SocialAuthProvider>>(getRepositoryToken(SocialAuthProvider));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleOAuthLogin', () => {
    const oauthProfile = {
      id: 'google123',
      emails: [{ value: 'test@example.com' }],
      name: { givenName: 'John', familyName: 'Doe' },
      photos: [{ value: 'https://example.com/photo.jpg' }],
      provider: 'google',
    };

    it('should create new user and link OAuth account', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountStatus: AccountStatus.ACTIVE,
        emailVerified: true,
      };

      const mockSocialProvider = {
        id: 1,
        userId: mockUser.id,
        providerName: OAuthProvider.GOOGLE,
        providerUserId: 'google123',
        providerEmail: 'test@example.com',
      };

      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      mockUsersService.findByEmail.mockResolvedValue(null);
      mockSocialProviderRepository.findOne.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(mockUser);
      mockSocialProviderRepository.create.mockReturnValue(mockSocialProvider);
      mockSocialProviderRepository.save.mockResolvedValue(mockSocialProvider);
      mockAuthService.generateTokens.mockResolvedValue(mockTokens);
      mockAuthService.sanitizeUser.mockReturnValue(mockUser);
      mockEmailService.sendWelcomeEmail.mockResolvedValue(undefined);

      const result = await service.handleOAuthLogin(oauthProfile, OAuthProvider.GOOGLE);

      expect(mockUsersService.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        profileImageUrl: 'https://example.com/photo.jpg',
        emailVerified: true,
        accountStatus: AccountStatus.ACTIVE,
      });

      expect(mockSocialProviderRepository.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        providerName: OAuthProvider.GOOGLE,
        providerUserId: 'google123',
        providerEmail: 'test@example.com',
        providerData: oauthProfile,
        lastUsedAt: expect.any(Date),
      });

      expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith('test@example.com', 'John');
      
      expect(result).toEqual({
        user: mockUser,
        tokens: mockTokens,
        isNewUser: true,
      });
    });

    it('should link OAuth account to existing user', async () => {
      const existingUser = {
        id: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountStatus: AccountStatus.ACTIVE,
      };

      const mockSocialProvider = {
        id: 1,
        userId: existingUser.id,
        providerName: OAuthProvider.GOOGLE,
        providerUserId: 'google123',
      };

      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      mockUsersService.findByEmail.mockResolvedValue(existingUser);
      mockSocialProviderRepository.findOne.mockResolvedValue(null);
      mockSocialProviderRepository.create.mockReturnValue(mockSocialProvider);
      mockSocialProviderRepository.save.mockResolvedValue(mockSocialProvider);
      mockAuthService.generateTokens.mockResolvedValue(mockTokens);
      mockAuthService.sanitizeUser.mockReturnValue(existingUser);

      const result = await service.handleOAuthLogin(oauthProfile, OAuthProvider.GOOGLE);

      expect(mockUsersService.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendWelcomeEmail).not.toHaveBeenCalled();
      
      expect(result).toEqual({
        user: existingUser,
        tokens: mockTokens,
        isNewUser: false,
      });
    });

    it('should login existing user with linked OAuth account', async () => {
      const existingUser = {
        id: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const existingSocialProvider = {
        id: 1,
        userId: existingUser.id,
        providerName: OAuthProvider.GOOGLE,
        providerUserId: 'google123',
        updateLastUsed: jest.fn(),
        user: existingUser,
      };

      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      mockSocialProviderRepository.findOne.mockResolvedValue(existingSocialProvider);
      mockSocialProviderRepository.save.mockResolvedValue(existingSocialProvider);
      mockAuthService.generateTokens.mockResolvedValue(mockTokens);
      mockAuthService.sanitizeUser.mockReturnValue(existingUser);

      const result = await service.handleOAuthLogin(oauthProfile, OAuthProvider.GOOGLE);

      expect(existingSocialProvider.updateLastUsed).toHaveBeenCalled();
      expect(mockSocialProviderRepository.save).toHaveBeenCalledWith(existingSocialProvider);
      
      expect(result).toEqual({
        user: existingUser,
        tokens: mockTokens,
        isNewUser: false,
      });
    });

    it('should throw ConflictException when trying to link already linked provider', async () => {
      const existingUser = {
        id: 1,
        email: 'test@example.com',
      };

      const existingSocialProvider = {
        id: 1,
        userId: 999, // Different user ID
        providerName: OAuthProvider.GOOGLE,
        providerUserId: 'google123',
        user: { id: 999, email: 'other@example.com' },
      };

      mockUsersService.findByEmail.mockResolvedValue(existingUser);
      // First call returns null (no existing social account), second call returns the conflicting provider
      mockSocialProviderRepository.findOne
        .mockResolvedValueOnce(null) // First call: check if social account exists
        .mockResolvedValueOnce(existingSocialProvider); // Second call: check if provider is linked to other user

      await expect(service.handleOAuthLogin(oauthProfile, OAuthProvider.GOOGLE))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('disconnectSocialAccount', () => {
    it('should successfully disconnect social account', async () => {
      const userId = 1;
      const provider = OAuthProvider.GOOGLE;
      
      const mockSocialProvider = {
        id: 1,
        userId,
        providerName: provider,
        providerUserId: 'google123',
      };

      mockSocialProviderRepository.findOne.mockResolvedValue(mockSocialProvider);
      mockSocialProviderRepository.remove.mockResolvedValue(mockSocialProvider);

      const result = await service.disconnectSocialAccount(userId, provider);

      expect(mockSocialProviderRepository.findOne).toHaveBeenCalledWith({
        where: { userId, providerName: provider },
      });
      expect(mockSocialProviderRepository.remove).toHaveBeenCalledWith(mockSocialProvider);
      expect(result).toEqual({
        success: true,
        message: 'Social account disconnected successfully',
      });
    });

    it('should throw NotFoundException when social account not found', async () => {
      const userId = 1;
      const provider = OAuthProvider.GOOGLE;

      mockSocialProviderRepository.findOne.mockResolvedValue(null);

      await expect(service.disconnectSocialAccount(userId, provider))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserSocialAccounts', () => {
    it('should return user social accounts', async () => {
      const userId = 1;
      const mockSocialProviders = [
        {
          id: 1,
          providerName: OAuthProvider.GOOGLE,
          providerEmail: 'test@gmail.com',
          connectedAt: new Date(),
          lastUsedAt: new Date(),
        },
        {
          id: 2,
          providerName: OAuthProvider.FACEBOOK,
          providerEmail: 'test@facebook.com',
          connectedAt: new Date(),
          lastUsedAt: new Date(),
        },
      ];

      mockSocialProviderRepository.find.mockResolvedValue(mockSocialProviders);

      const result = await service.getUserSocialAccounts(userId);

      expect(mockSocialProviderRepository.find).toHaveBeenCalledWith({
        where: { userId },
        select: ['id', 'providerName', 'providerEmail', 'connectedAt', 'lastUsedAt'],
      });
      expect(result).toEqual(mockSocialProviders);
    });
  });

  describe('extractProfileData', () => {
    it('should extract Google profile data correctly', () => {
      const googleProfile = {
        id: 'google123',
        emails: [{ value: 'test@example.com' }],
        name: { givenName: 'John', familyName: 'Doe' },
        photos: [{ value: 'https://example.com/photo.jpg' }],
        provider: 'google',
      };

      const result = service.extractProfileData(googleProfile);

      expect(result).toEqual({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        profileImageUrl: 'https://example.com/photo.jpg',
      });
    });

    it('should extract Facebook profile data correctly', () => {
      const facebookProfile = {
        id: 'facebook123',
        emails: [{ value: 'test@example.com' }],
        name: { givenName: 'John', familyName: 'Doe' },
        photos: [{ value: 'https://facebook.com/photo.jpg' }],
        provider: 'facebook',
      };

      const result = service.extractProfileData(facebookProfile);

      expect(result).toEqual({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        profileImageUrl: 'https://facebook.com/photo.jpg',
      });
    });

    it('should handle missing profile data gracefully', () => {
      const incompleteProfile = {
        id: 'google123',
        emails: [],
        name: { givenName: 'John' },
        photos: [],
        provider: 'google',
      };

      const result = service.extractProfileData(incompleteProfile);

      expect(result).toEqual({
        email: null,
        firstName: 'John',
        lastName: null,
        profileImageUrl: null,
      });
    });
  });
});