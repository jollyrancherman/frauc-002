import { Injectable, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { EmailService } from '../services/email.service';
import { UserVerification } from './entities/user-verification.entity';
import { RegisterDto } from './dto/register.dto';
import { VerificationType } from '../common/enums/verification-type.enum';
import { AccountStatus } from '../common/enums/account-status.enum';

export interface RegistrationResponse {
  success: boolean;
  message: string;
  userId?: number;
}

export interface VerificationResponse {
  success: boolean;
  message: string;
  emailVerified?: boolean;
}

@Injectable()
export class RegistrationService {
  constructor(
    @InjectRepository(UserVerification)
    private verificationRepository: Repository<UserVerification>,
    private usersService: UsersService,
    private emailService: EmailService,
  ) {}

  async initiateRegistration(registerDto: RegisterDto): Promise<RegistrationResponse> {
    const { email, password, firstName, lastName } = registerDto;

    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user with pending verification status
    const user = await this.usersService.create({
      email,
      firstName,
      lastName,
      passwordHash,
    });

    // Generate verification code and create verification record
    const verificationCode = this.generateVerificationCode();
    const verification = await this.createVerificationRecord(
      user.id,
      email,
      VerificationType.EMAIL,
      verificationCode
    );

    // Send verification email
    try {
      await this.emailService.sendVerificationEmail(email, verificationCode);
    } catch (error) {
      // Log error but don't fail registration - user can request resend
      console.error('Failed to send verification email:', error);
    }

    return {
      success: true,
      message: 'Registration initiated. Please check your email for verification code.',
      userId: user.id,
    };
  }

  async verifyEmail(email: string, verificationCode: string): Promise<VerificationResponse> {
    // Find user
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Find active verification record
    const verification = await this.verificationRepository.findOne({
      where: {
        userId: user.id,
        verificationType: VerificationType.EMAIL,
        verificationValue: email,
        verifiedAt: null, // Not yet verified
      },
      order: { createdAt: 'DESC' }, // Get most recent
    });

    if (!verification) {
      throw new BadRequestException('No pending verification found for this email');
    }

    // Check if verification is still valid
    if (!verification.canAttempt) {
      if (verification.isExpired) {
        throw new BadRequestException('Verification code has expired. Please request a new one.');
      } else {
        throw new BadRequestException('Maximum verification attempts exceeded. Please request a new code.');
      }
    }

    // Increment attempt count
    verification.attempts += 1;

    // Check verification code
    if (verification.verificationCode !== verificationCode) {
      await this.verificationRepository.save(verification);
      throw new BadRequestException('Invalid verification code');
    }

    // Mark as verified
    verification.verifiedAt = new Date();
    await this.verificationRepository.save(verification);

    // Update user status
    await this.usersService.update(user.id, {
      emailVerified: true,
      accountStatus: AccountStatus.ACTIVE,
    });

    return {
      success: true,
      message: 'Email verified successfully',
      emailVerified: true,
    };
  }

  async resendVerificationEmail(email: string): Promise<VerificationResponse> {
    // Find user
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if already verified
    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Generate new verification code
    const verificationCode = this.generateVerificationCode();
    const verification = await this.createVerificationRecord(
      user.id,
      email,
      VerificationType.EMAIL,
      verificationCode
    );

    // Send verification email
    await this.emailService.sendVerificationEmail(email, verificationCode);

    return {
      success: true,
      message: 'Verification email sent',
    };
  }

  private async createVerificationRecord(
    userId: number,
    verificationValue: string,
    verificationType: VerificationType,
    verificationCode: string
  ): Promise<UserVerification> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minutes expiry

    const verification = this.verificationRepository.create({
      userId,
      verificationType,
      verificationValue,
      verificationCode,
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
    });

    return await this.verificationRepository.save(verification);
  }

  generateVerificationCode(): string {
    // Generate 6-digit numeric code
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async getVerificationStatus(email: string): Promise<{
    isVerified: boolean;
    hasPendingVerification: boolean;
    attemptsRemaining?: number;
    expiresAt?: Date;
  }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      return {
        isVerified: true,
        hasPendingVerification: false,
      };
    }

    // Find most recent verification
    const verification = await this.verificationRepository.findOne({
      where: {
        userId: user.id,
        verificationType: VerificationType.EMAIL,
        verificationValue: email,
        verifiedAt: null,
      },
      order: { createdAt: 'DESC' },
    });

    if (!verification) {
      return {
        isVerified: false,
        hasPendingVerification: false,
      };
    }

    return {
      isVerified: false,
      hasPendingVerification: true,
      attemptsRemaining: Math.max(0, verification.maxAttempts - verification.attempts),
      expiresAt: verification.expiresAt,
    };
  }
}