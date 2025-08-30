import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../services/email.service';
import { SmsService } from '../services/sms.service';
import { AuditLogService } from '../services/audit-log.service';
import { RedisService } from '../config/redis.config';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { User } from '../users/entities/user.entity';
import * as crypto from 'crypto';

export interface PasswordResetResult {
  success: boolean;
  message: string;
  method?: 'email' | 'sms';
  expiresIn?: number;
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
}

export interface ResetCodeValidation {
  isValid: boolean;
  userId?: number;
  method?: 'email' | 'sms';
  attemptsRemaining?: number;
  error?: string;
}

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  private readonly MAX_RESET_ATTEMPTS = 5;
  private readonly MAX_REQUESTS_PER_HOUR = 3;
  private readonly TOKEN_EXPIRY_HOURS = 1;
  private readonly CODE_EXPIRY_MINUTES = 15;

  constructor(
    @InjectRepository(PasswordResetToken)
    private passwordResetRepository: Repository<PasswordResetToken>,
    private authService: AuthService,
    private usersService: UsersService,
    private emailService: EmailService,
    private smsService: SmsService,
    private auditLogService: AuditLogService,
    private redisService: RedisService,
  ) {}

  async initiatePasswordReset(
    identifier: string, // email or phone
    method: 'email' | 'sms',
    ipAddress?: string,
  ): Promise<PasswordResetResult> {
    let user: User | null = null;

    // Find user by email or phone
    if (method === 'email') {
      user = await this.usersService.findByEmail(identifier);
    } else if (method === 'sms') {
      // Validate and format phone number
      if (!this.smsService.validatePhoneNumber(identifier)) {
        throw new BadRequestException('Invalid phone number format');
      }
      const formattedPhone = this.smsService.formatPhoneNumber(identifier);
      user = await this.usersService.findByPhone(formattedPhone);
    }

    if (!user) {
      throw new NotFoundException('No account found with this information');
    }

    // Check rate limiting
    await this.checkResetRateLimit(user.id, ipAddress || 'unknown');

    // Invalidate any existing reset tokens for this user
    await this.passwordResetRepository.update(
      { userId: user.id, isUsed: false },
      { isUsed: true, usedAt: new Date() },
    );

    // Generate secure reset token and code
    const resetToken = this.generateResetToken();
    const resetCode = this.generateResetCode();

    // Create password reset token record
    const passwordReset = this.passwordResetRepository.create({
      userId: user.id,
      token: resetToken,
      resetCode,
      method,
      expiresAt: new Date(Date.now() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000),
      ipAddress: ipAddress || 'unknown',
      attempts: 0,
      isUsed: false,
    });

    await this.passwordResetRepository.save(passwordReset);

    // Send reset code via chosen method
    if (method === 'email') {
      await this.emailService.sendPasswordResetEmail(
        user.email,
        resetCode,
        user.firstName,
      );
    } else if (method === 'sms') {
      const message = this.smsService.getPasswordResetTemplate(resetCode);
      await this.smsService.sendMessage(user.phone, message, true);
    }

    // Update rate limiting
    await this.updateResetRateLimit(user.id, ipAddress || 'unknown');

    // Log the password reset request
    await this.auditLogService.logPasswordResetRequest(user.id, method, ipAddress || 'unknown');

    this.logger.log(`Password reset initiated for user ${user.id} via ${method}`);

    return {
      success: true,
      message: `Password reset code sent to your ${method === 'email' ? 'email' : 'phone'}`,
      method,
      expiresIn: this.TOKEN_EXPIRY_HOURS * 3600, // seconds
    };
  }

  async resetPassword(resetCode: string, newPassword: string): Promise<PasswordResetResult> {
    const resetToken = await this.passwordResetRepository.findOne({
      where: { resetCode, isUsed: false },
      relations: ['user'],
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    if (resetToken.isExpired) {
      throw new BadRequestException('Reset code has expired. Please request a new one.');
    }

    if (resetToken.attempts >= this.MAX_RESET_ATTEMPTS) {
      throw new BadRequestException('Maximum reset attempts exceeded. Please request a new code.');
    }

    // Validate password strength
    this.validatePasswordStrength(newPassword);

    // Hash the new password
    const passwordHash = await this.authService.hashPassword(newPassword);

    // Update user's password
    await this.usersService.update(resetToken.userId, { passwordHash });

    // Mark reset token as used
    await this.passwordResetRepository.update(
      { id: resetToken.id },
      { isUsed: true, usedAt: new Date() },
    );

    // Generate new auth tokens for automatic login
    const tokens = await this.authService.generateTokens(resetToken.user);

    // Log successful password reset
    await this.auditLogService.logPasswordResetSuccess(resetToken.userId, resetToken.method);

    // Clear rate limiting for this user
    await this.clearResetRateLimit(resetToken.userId);

    this.logger.log(`Password reset completed successfully for user ${resetToken.userId}`);

    return {
      success: true,
      message: 'Password reset successfully. You are now logged in.',
      tokens,
    };
  }

  async validateResetCode(resetCode: string): Promise<ResetCodeValidation> {
    const resetToken = await this.passwordResetRepository.findOne({
      where: { resetCode, isUsed: false },
      relations: ['user'],
    });

    if (!resetToken) {
      return {
        isValid: false,
        error: 'Invalid reset code',
      };
    }

    if (resetToken.isExpired) {
      return {
        isValid: false,
        error: 'Reset code has expired',
      };
    }

    if (resetToken.attempts >= this.MAX_RESET_ATTEMPTS) {
      return {
        isValid: false,
        error: 'Maximum attempts exceeded',
      };
    }

    return {
      isValid: true,
      userId: resetToken.userId,
      method: resetToken.method,
      attemptsRemaining: this.MAX_RESET_ATTEMPTS - resetToken.attempts,
    };
  }

  async incrementResetAttempts(resetCode: string): Promise<void> {
    await this.passwordResetRepository.increment(
      { resetCode, isUsed: false },
      'attempts',
      1,
    );
  }

  private generateResetToken(): string {
    // Generate cryptographically secure random token
    return crypto.randomBytes(32).toString('hex');
  }

  private generateResetCode(): string {
    // Generate 6-digit numeric code
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private validatePasswordStrength(password: string): void {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const errors: string[] = [];

    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long`);
    }
    if (!hasUpperCase) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!hasLowerCase) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!hasNumbers) {
      errors.push('Password must contain at least one number');
    }
    if (!hasSpecialChar) {
      errors.push('Password must contain at least one special character');
    }

    if (errors.length > 0) {
      throw new BadRequestException(`Password validation failed: ${errors.join(', ')}`);
    }
  }

  private async checkResetRateLimit(userId: number, ipAddress: string): Promise<void> {
    const userKey = `reset_limit:user:${userId}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;
    const ipKey = `reset_limit:ip:${ipAddress}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;

    const [userCount, ipCount] = await Promise.all([
      this.redisService.get(userKey),
      this.redisService.get(ipKey),
    ]);

    if (userCount && parseInt(userCount) >= this.MAX_REQUESTS_PER_HOUR) {
      throw new HttpException(
        'Too many password reset requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (ipCount && parseInt(ipCount) >= this.MAX_REQUESTS_PER_HOUR * 2) {
      throw new HttpException(
        'Too many password reset requests from this IP. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async updateResetRateLimit(userId: number, ipAddress: string): Promise<void> {
    const userKey = `reset_limit:user:${userId}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;
    const ipKey = `reset_limit:ip:${ipAddress}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;

    await Promise.all([
      this.redisService.incr(userKey),
      this.redisService.incr(ipKey),
    ]);

    await Promise.all([
      this.redisService.expire(userKey, 3600), // 1 hour
      this.redisService.expire(ipKey, 3600), // 1 hour
    ]);
  }

  private async clearResetRateLimit(userId: number): Promise<void> {
    const currentHour = Math.floor(Date.now() / (1000 * 60 * 60));
    const userKey = `reset_limit:user:${userId}:${currentHour}`;
    
    await this.redisService.del(userKey);
  }
}