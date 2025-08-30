import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from '../strategies/google.strategy';
import { FacebookStrategy } from '../strategies/facebook.strategy';
import { SocialAuthService } from '../social-auth.service';
import { OAuthProvider } from '../../common/enums/oauth-provider.enum';

describe('OAuth Strategies', () => {
  let googleStrategy: GoogleStrategy;
  let facebookStrategy: FacebookStrategy;
  let socialAuthService: SocialAuthService;
  let configService: ConfigService;

  const mockSocialAuthService = {
    handleOAuthLogin: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      const config = {
        'GOOGLE_CLIENT_ID': 'test-google-client-id',
        'GOOGLE_CLIENT_SECRET': 'test-google-secret',
        'FACEBOOK_CLIENT_ID': 'test-facebook-client-id',
        'FACEBOOK_CLIENT_SECRET': 'test-facebook-secret',
        'BACKEND_URL': 'http://localhost:3001',
        'FRONTEND_URL': 'http://localhost:3000',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        FacebookStrategy,
        {
          provide: SocialAuthService,
          useValue: mockSocialAuthService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    googleStrategy = module.get<GoogleStrategy>(GoogleStrategy);
    facebookStrategy = module.get<FacebookStrategy>(FacebookStrategy);
    socialAuthService = module.get<SocialAuthService>(SocialAuthService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GoogleStrategy', () => {
    it('should be defined', () => {
      expect(googleStrategy).toBeDefined();
    });

    it('should validate Google OAuth profile', async () => {
      const mockProfile = {
        id: 'google123',
        emails: [{ value: 'test@example.com' }],
        name: { givenName: 'John', familyName: 'Doe' },
        photos: [{ value: 'https://example.com/photo.jpg' }],
        provider: 'google',
      };

      const mockAuthResult = {
        user: { id: 1, email: 'test@example.com' },
        tokens: { accessToken: 'token', refreshToken: 'refresh' },
        isNewUser: true,
      };

      mockSocialAuthService.handleOAuthLogin.mockResolvedValue(mockAuthResult);

      const mockDone = jest.fn();
      
      await googleStrategy.validate(
        'access-token',
        'refresh-token',
        mockProfile,
        mockDone
      );

      expect(mockSocialAuthService.handleOAuthLogin).toHaveBeenCalledWith(
        mockProfile,
        OAuthProvider.GOOGLE
      );
      expect(mockDone).toHaveBeenCalledWith(null, mockAuthResult);
    });

    it('should handle Google OAuth validation errors', async () => {
      const mockProfile = {
        id: 'google123',
        emails: [{ value: 'test@example.com' }],
        name: { givenName: 'John', familyName: 'Doe' },
        provider: 'google',
      };

      const mockError = new Error('OAuth failed');
      mockSocialAuthService.handleOAuthLogin.mockRejectedValue(mockError);

      const mockDone = jest.fn();

      await googleStrategy.validate('access-token', 'refresh-token', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(mockError, null);
    });
  });

  describe('FacebookStrategy', () => {
    it('should be defined', () => {
      expect(facebookStrategy).toBeDefined();
    });

    it('should validate Facebook OAuth profile', async () => {
      const mockProfile = {
        id: 'facebook123',
        displayName: 'John Doe',
        emails: [{ value: 'test@example.com' }],
        name: { givenName: 'John', familyName: 'Doe' },
        photos: [{ value: 'https://facebook.com/photo.jpg' }],
        provider: 'facebook',
        birthday: null,
        _raw: '{}',
        _json: {},
      };

      const mockAuthResult = {
        user: { id: 1, email: 'test@example.com' },
        tokens: { accessToken: 'token', refreshToken: 'refresh' },
        isNewUser: false,
      };

      mockSocialAuthService.handleOAuthLogin.mockResolvedValue(mockAuthResult);

      const mockDone = jest.fn();

      await facebookStrategy.validate(
        'access-token',
        'refresh-token',
        mockProfile,
        mockDone
      );

      expect(mockSocialAuthService.handleOAuthLogin).toHaveBeenCalledWith(
        mockProfile,
        OAuthProvider.FACEBOOK
      );
      expect(mockDone).toHaveBeenCalledWith(null, mockAuthResult);
    });

    it('should handle Facebook OAuth validation errors', async () => {
      const mockProfile = {
        id: 'facebook123',
        displayName: 'John Doe',
        emails: [{ value: 'test@example.com' }],
        name: { givenName: 'John', familyName: 'Doe' },
        provider: 'facebook',
        birthday: null,
        _raw: '{}',
        _json: {},
      };

      const mockError = new Error('Facebook OAuth failed');
      mockSocialAuthService.handleOAuthLogin.mockRejectedValue(mockError);

      const mockDone = jest.fn();

      await facebookStrategy.validate('access-token', 'refresh-token', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(mockError, null);
    });
  });

  describe('Strategy Configuration', () => {
    it('should configure Google strategy with correct options', () => {
      // Test that strategy is constructed with correct config
      expect(mockConfigService.get).toHaveBeenCalledWith('GOOGLE_CLIENT_ID');
      expect(mockConfigService.get).toHaveBeenCalledWith('GOOGLE_CLIENT_SECRET');
    });

    it('should configure Facebook strategy with correct options', () => {
      // Test that strategy is constructed with correct config
      expect(mockConfigService.get).toHaveBeenCalledWith('FACEBOOK_CLIENT_ID');
      expect(mockConfigService.get).toHaveBeenCalledWith('FACEBOOK_CLIENT_SECRET');
    });
  });
});