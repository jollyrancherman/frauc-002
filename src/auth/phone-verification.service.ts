import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PhoneVerification } from './entities/phone-verification.entity';
import { SmsService } from '../services/sms.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../config/redis.config';

export interface PhoneVerificationResult {
  success: boolean;
  message: string;
  phoneNumber?: string;
  expiresIn?: number;
  requiresVerification?: boolean;
  attemptsRemaining?: number;
  expiresAt?: Date;
}

export interface PhoneVerificationStatus {
  hasActiveVerification: boolean;
  phoneNumber?: string;
  isVerified?: boolean;
  attemptsRemaining?: number;
  expiresAt?: Date;
}

@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);
  private readonly MAX_ATTEMPTS = 5;
  private readonly MAX_SMS_PER_HOUR = 5;
  private readonly MAX_RESENDS_PER_HOUR = 3;
  private readonly VERIFICATION_EXPIRY_MINUTES = 15;

  constructor(
    @InjectRepository(PhoneVerification)
    private phoneVerificationRepository: Repository<PhoneVerification>,
    private smsService: SmsService,
    private usersService: UsersService,
    private redisService: RedisService,
  ) {}

  async initiatePhoneVerification(
    userId: number,
    phoneNumber: string,
  ): Promise<PhoneVerificationResult> {
    // Validate user exists
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate phone number format
    if (!this.smsService.validatePhoneNumber(phoneNumber)) {
      throw new BadRequestException('Invalid phone number format');
    }

    // Format phone number
    const formattedPhone = this.smsService.formatPhoneNumber(phoneNumber);

    // Check if phone number is already taken by another user
    const existingUser = await this.usersService.findByPhone(formattedPhone);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('Phone number is already in use');
    }

    // Check rate limiting
    await this.checkSmsRateLimit(userId, formattedPhone);

    // Check for existing active verification
    const existingVerification = await this.phoneVerificationRepository.findOne({
      where: {
        userId,
        isVerified: false,
      },
      order: { createdAt: 'DESC' },
    });

    // If there's an active verification, update it instead of creating new one
    let verification: PhoneVerification;
    if (existingVerification && !existingVerification.isExpired) {
      verification = existingVerification;
      verification.phoneNumber = formattedPhone;
      verification.verificationCode = this.generateVerificationCode();
      verification.resetAttempts();
      verification.extendExpiration(this.VERIFICATION_EXPIRY_MINUTES);
    } else {
      verification = this.phoneVerificationRepository.create({
        userId,
        phoneNumber: formattedPhone,
        verificationCode: this.generateVerificationCode(),
        expiresAt: new Date(Date.now() + this.VERIFICATION_EXPIRY_MINUTES * 60 * 1000),
        attempts: 0,
        isVerified: false,
      });
    }

    await this.phoneVerificationRepository.save(verification);

    // Send SMS
    const smsResult = await this.smsService.sendVerificationCode(
      formattedPhone,
      verification.verificationCode,
    );

    if (!smsResult.success) {
      this.logger.error(
        `Failed to send SMS verification code to user ${userId}: ${smsResult.error}`,
      );
      throw new BadRequestException('Failed to send verification code. Please try again.');
    }

    // Update rate limiting
    await this.updateSmsRateLimit(userId, formattedPhone);

    this.logger.log(`Phone verification initiated for user ${userId}`);

    return {
      success: true,
      message: 'Verification code sent to your phone',
      phoneNumber: this.smsService.maskPhoneNumber(formattedPhone),
      expiresIn: this.VERIFICATION_EXPIRY_MINUTES * 60, // seconds
    };
  }

  async verifyPhone(userId: number, verificationCode: string): Promise<PhoneVerificationResult> {
    const verification = await this.phoneVerificationRepository.findOne({
      where: {
        userId,
        isVerified: false,
      },
      order: { createdAt: 'DESC' },
    });

    if (!verification) {
      throw new NotFoundException('No pending phone verification found');
    }

    if (verification.isExpired) {
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }

    if (verification.attemptsRemaining <= 0) {
      throw new BadRequestException(
        'Maximum verification attempts exceeded. Please request a new code.',
      );
    }

    if (verification.verificationCode !== verificationCode) {
      verification.incrementAttempts();
      await this.phoneVerificationRepository.update(
        { id: verification.id },
        { attempts: verification.attempts },
      );

      throw new BadRequestException(
        `Invalid verification code. ${verification.attemptsRemaining - 1} attempts remaining.`,
      );
    }

    // Verify the phone number
    verification.markAsVerified();
    await this.phoneVerificationRepository.update(
      { id: verification.id },
      { 
        isVerified: true, 
        verifiedAt: verification.verifiedAt 
      },
    );

    // Update user's phone number and verification status
    await this.usersService.update(userId, {
      phone: verification.phoneNumber,
      phoneVerified: true,
    });

    // Clean up rate limiting
    await this.clearRateLimits(userId, verification.phoneNumber);

    this.logger.log(`Phone number verified successfully for user ${userId}`);

    return {
      success: true,
      message: 'Phone number verified successfully',
      phoneNumber: this.smsService.maskPhoneNumber(verification.phoneNumber),
    };
  }

  async resendVerificationCode(userId: number): Promise<PhoneVerificationResult> {
    const verification = await this.phoneVerificationRepository.findOne({
      where: {
        userId,
        isVerified: false,
      },
      order: { createdAt: 'DESC' },
    });

    if (!verification) {
      throw new NotFoundException('No pending phone verification found');
    }

    if (verification.isVerified) {
      throw new BadRequestException('Phone number is already verified');
    }

    // Check resend rate limiting
    await this.checkResendRateLimit(userId);

    // Generate new code and reset attempts
    const newCode = this.generateVerificationCode();
    verification.verificationCode = newCode;
    verification.resetAttempts();
    verification.extendExpiration(this.VERIFICATION_EXPIRY_MINUTES);

    await this.phoneVerificationRepository.update(
      { id: verification.id },
      {
        verificationCode: newCode,
        attempts: 0,
        expiresAt: verification.expiresAt,
      },
    );

    // Send new SMS
    const smsResult = await this.smsService.sendVerificationCode(
      verification.phoneNumber,
      newCode,
    );

    if (!smsResult.success) {
      throw new BadRequestException('Failed to resend verification code. Please try again.');
    }

    // Update resend rate limiting
    await this.updateResendRateLimit(userId);

    this.logger.log(`Verification code resent for user ${userId}`);

    return {
      success: true,
      message: 'New verification code sent',
      phoneNumber: this.smsService.maskPhoneNumber(verification.phoneNumber),
      expiresIn: this.VERIFICATION_EXPIRY_MINUTES * 60,
    };
  }

  async updatePhoneNumber(userId: number, newPhoneNumber: string): Promise<PhoneVerificationResult> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate and format the new phone number
    if (!this.smsService.validatePhoneNumber(newPhoneNumber)) {
      throw new BadRequestException('Invalid phone number format');
    }

    const formattedPhone = this.smsService.formatPhoneNumber(newPhoneNumber);

    // Check if it's the same as current phone
    if (user.phone && user.phoneVerified && user.phone === formattedPhone) {
      throw new BadRequestException('This is already your verified phone number');
    }

    // Check if phone number is already taken
    const existingUser = await this.usersService.findByPhone(formattedPhone);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('Phone number is already in use');
    }

    // Initiate verification for the new phone number
    return await this.initiatePhoneVerification(userId, formattedPhone);
  }

  async getVerificationStatus(userId: number): Promise<PhoneVerificationStatus> {
    const verification = await this.phoneVerificationRepository.findOne({
      where: {
        userId,
        isVerified: false,
      },
      order: { createdAt: 'DESC' },
    });

    if (!verification) {
      return {
        hasActiveVerification: false,
      };
    }

    return {
      hasActiveVerification: true,
      phoneNumber: this.smsService.maskPhoneNumber(verification.phoneNumber),
      isVerified: verification.isVerified,
      attemptsRemaining: verification.attemptsRemaining,
      expiresAt: verification.expiresAt,
    };
  }

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async checkSmsRateLimit(userId: number, phoneNumber: string): Promise<void> {
    const hourlyKey = `sms_limit:${userId}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;
    const phoneHourlyKey = `sms_phone_limit:${phoneNumber}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;

    const [userCount, phoneCount] = await Promise.all([
      this.redisService.get(hourlyKey),
      this.redisService.get(phoneHourlyKey),
    ]);

    if (userCount && parseInt(userCount) >= this.MAX_SMS_PER_HOUR) {
      throw new HttpException(
        'Too many SMS verification requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (phoneCount && parseInt(phoneCount) >= this.MAX_SMS_PER_HOUR) {
      throw new HttpException(
        'Too many verification requests for this phone number. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async updateSmsRateLimit(userId: number, phoneNumber: string): Promise<void> {
    const hourlyKey = `sms_limit:${userId}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;
    const phoneHourlyKey = `sms_phone_limit:${phoneNumber}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;

    await Promise.all([
      this.redisService.incr(hourlyKey),
      this.redisService.incr(phoneHourlyKey),
    ]);

    await Promise.all([
      this.redisService.expire(hourlyKey, 3600), // 1 hour
      this.redisService.expire(phoneHourlyKey, 3600), // 1 hour
    ]);
  }

  private async checkResendRateLimit(userId: number): Promise<void> {
    const hourlyKey = `resend_limit:${userId}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;
    const count = await this.redisService.get(hourlyKey);

    if (count && parseInt(count) >= this.MAX_RESENDS_PER_HOUR) {
      throw new HttpException(
        'Too many resend requests. Please wait before requesting another code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async updateResendRateLimit(userId: number): Promise<void> {
    const hourlyKey = `resend_limit:${userId}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;
    
    await this.redisService.incr(hourlyKey);
    await this.redisService.expire(hourlyKey, 3600); // 1 hour
  }

  private async clearRateLimits(userId: number, phoneNumber: string): Promise<void> {
    const currentHour = Math.floor(Date.now() / (1000 * 60 * 60));
    
    const keys = [
      `sms_limit:${userId}:${currentHour}`,
      `sms_phone_limit:${phoneNumber}:${currentHour}`,
      `resend_limit:${userId}:${currentHour}`,
    ];

    await Promise.all(keys.map(key => this.redisService.del(key)));
  }
}