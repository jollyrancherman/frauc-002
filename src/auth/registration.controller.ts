import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { RegistrationService } from './registration.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { Public } from './decorators/public.decorator';

@Controller('auth/register')
export class RegistrationController {
  constructor(
    private readonly registrationService: RegistrationService,
    private readonly authService: AuthService,
  ) {}

  @Post('initiate')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  async initiateRegistration(@Body() registerDto: RegisterDto) {
    return this.registrationService.initiateRegistration(registerDto);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 attempts per minute
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.registrationService.verifyEmail(
      verifyEmailDto.email,
      verifyEmailDto.verificationCode
    );
  }

  @Post('resend-verification')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 attempts per 5 minutes
  async resendVerificationEmail(@Body('email') email: string) {
    return this.registrationService.resendVerificationEmail(email);
  }

  @Get('verification-status')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getVerificationStatus(@Query('email') email: string) {
    return this.registrationService.getVerificationStatus(email);
  }

  @Post('complete-profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async completeProfile(
    @Body() completeProfileDto: CompleteProfileDto,
    @GetUser() user: User,
    @Req() req: Request
  ) {
    // Extract location from IP if not provided
    let locationText = completeProfileDto.locationText;
    if (!locationText && req.ip) {
      // In a real implementation, you might use a geolocation service here
      locationText = `Location from IP: ${req.ip}`;
    }

    const updatedProfile = {
      ...completeProfileDto,
      locationText,
    };

    return this.authService.completeUserProfile(user.id, updatedProfile);
  }

  @Post('login-after-verification')
  @Public()
  @HttpCode(HttpStatus.OK)
  async loginAfterVerification(
    @Body() loginDto: { email: string; password: string },
    @Req() req: Request
  ) {
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');
    
    return this.authService.login(loginDto, ipAddress, userAgent);
  }
}