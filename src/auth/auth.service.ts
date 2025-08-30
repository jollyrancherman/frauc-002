import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { RedisService } from '../config/redis.config';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { UserSession } from './entities/user-session.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthResponse } from './interfaces/auth-response.interface';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserSession)
    private sessionRepository: Repository<UserSession>,
    private usersService: UsersService,
    private jwtService: JwtService,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const { email, password, firstName, lastName } = registerDto;

    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await this.usersService.create({
      email,
      firstName,
      lastName,
      passwordHash: passwordHash,
    });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Create session
    await this.createSession(user.id, tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string): Promise<AuthResponse> {
    const { email, password } = loginDto;

    // Find user
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.usersService.updateLastLogin(user.id);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Create session
    await this.createSession(user.id, tokens.refreshToken, ipAddress, userAgent);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      // Check if session exists
      const session = await this.sessionRepository.findOne({
        where: { sessionToken: refreshToken, isActive: true },
        relations: ['user'],
      });

      if (!session || session.isExpired) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(session.user);

      // Update session with new refresh token
      session.sessionToken = tokens.refreshToken;
      session.updateActivity();
      await this.sessionRepository.save(session);

      return tokens;
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(refreshToken: string): Promise<void> {
    // Invalidate session
    await this.sessionRepository.update(
      { sessionToken: refreshToken },
      { isActive: false }
    );

    // Remove from Redis if cached
    await this.redisService.del(`session:${refreshToken}`);
  }

  async validateUser(payload: JwtPayload): Promise<User> {
    const user = await this.usersService.findOne(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }


  private async createSession(
    userId: number,
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<UserSession> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const session = this.sessionRepository.create({
      userId,
      sessionToken: refreshToken,
      ipAddress,
      userAgent,
      expiresAt,
      lastActivityAt: new Date(),
    });

    return await this.sessionRepository.save(session);
  }


  async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  async completeUserProfile(userId: number, profileData: any): Promise<any> {
    // Update user profile with provided data
    const updatedUser = await this.usersService.update(userId, profileData);
    
    return {
      success: true,
      message: 'Profile completed successfully',
      user: this.sanitizeUser(updatedUser),
    };
  }

  async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  sanitizeUser(user: User): Partial<User> {
    const { passwordHash, ...sanitizedUser } = user;
    return sanitizedUser;
  }
}