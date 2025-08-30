import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../config/redis.config';
import { UserSession } from '../entities/user-session.entity';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { AccountStatus } from '../../common/enums/account-status.enum';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;
  let sessionRepository: Repository<UserSession>;
  let redisService: RedisService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    updateLastLogin: jest.fn(),
    findOne: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verify: jest.fn(),
  };

  const mockSessionRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockRedisService = {
    del: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: getRepositoryToken(UserSession),
          useValue: mockSessionRepository,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
    sessionRepository = module.get<Repository<UserSession>>(getRepositoryToken(UserSession));
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      password: 'Test123!@#',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should register a new user successfully', async () => {
      const hashedPassword = 'hashedPassword';
      const mockUser = {
        id: 1,
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        passwordHash: hashedPassword,
        accountStatus: AccountStatus.PENDING_VERIFICATION,
        emailVerified: false,
        phoneVerified: false,
      };

      const mockTokens = {
        accessToken: 'accessToken',
        refreshToken: 'refreshToken',
      };

      const mockSession = {
        id: 'session-uuid',
        userId: mockUser.id,
        sessionToken: mockTokens.refreshToken,
      };

      mockUsersService.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      mockUsersService.create.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue('token');
      mockSessionRepository.create.mockReturnValue(mockSession);
      mockSessionRepository.save.mockResolvedValue(mockSession);

      const result = await service.register(registerDto);

      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 12);
      expect(mockUsersService.create).toHaveBeenCalledWith({
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        passwordHash: hashedPassword,
      });
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should throw ConflictException if user already exists', async () => {
      const existingUser = { id: 1, email: registerDto.email };
      mockUsersService.findByEmail.mockResolvedValue(existingUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'Test123!@#',
    };

    it('should login user successfully', async () => {
      const mockUser = {
        id: 1,
        email: loginDto.email,
        passwordHash: 'hashedPassword',
        firstName: 'John',
        lastName: 'Doe',
      };

      const mockTokens = {
        accessToken: 'accessToken',
        refreshToken: 'refreshToken',
      };

      const mockSession = {
        id: 'session-uuid',
        userId: mockUser.id,
        sessionToken: mockTokens.refreshToken,
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUsersService.updateLastLogin.mockResolvedValue(undefined);
      mockJwtService.signAsync.mockResolvedValue('token');
      mockSessionRepository.create.mockReturnValue(mockSession);
      mockSessionRepository.save.mockResolvedValue(mockSession);

      const result = await service.login(loginDto);

      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, mockUser.passwordHash);
      expect(mockUsersService.updateLastLogin).toHaveBeenCalledWith(mockUser.id);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const mockUser = {
        id: 1,
        email: loginDto.email,
        passwordHash: 'hashedPassword',
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('hashPassword', () => {
    it('should hash password correctly', async () => {
      const password = 'Test123!@#';
      const hashedPassword = 'hashedPassword';

      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);

      const result = await service.hashPassword(password);

      expect(bcrypt.hash).toHaveBeenCalledWith(password, 12);
      expect(result).toBe(hashedPassword);
    });
  });

  describe('comparePassword', () => {
    it('should compare passwords correctly', async () => {
      const password = 'Test123!@#';
      const hash = 'hashedPassword';

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.comparePassword(password, hash);

      expect(bcrypt.compare).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(true);
    });
  });
});