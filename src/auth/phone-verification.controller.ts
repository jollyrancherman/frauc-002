import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PhoneVerificationService } from './phone-verification.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import {
  InitiatePhoneVerificationDto,
  VerifyPhoneDto,
  UpdatePhoneNumberDto,
} from './dto/phone-verification.dto';

@Controller('auth/phone')
@UseGuards(JwtAuthGuard)
export class PhoneVerificationController {
  constructor(private readonly phoneVerificationService: PhoneVerificationService) {}

  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 requests per minute
  async initiatePhoneVerification(
    @GetUser() user: User,
    @Body() initiateDto: InitiatePhoneVerificationDto,
  ) {
    return await this.phoneVerificationService.initiatePhoneVerification(
      user.id,
      initiateDto.phoneNumber,
    );
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  async verifyPhone(@GetUser() user: User, @Body() verifyDto: VerifyPhoneDto) {
    return await this.phoneVerificationService.verifyPhone(user.id, verifyDto.verificationCode);
  }

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 2, ttl: 300000 } }) // 2 resends per 5 minutes
  async resendVerificationCode(@GetUser() user: User) {
    return await this.phoneVerificationService.resendVerificationCode(user.id);
  }

  @Put('update')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 updates per 5 minutes
  async updatePhoneNumber(@GetUser() user: User, @Body() updateDto: UpdatePhoneNumberDto) {
    return await this.phoneVerificationService.updatePhoneNumber(user.id, updateDto.phoneNumber);
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  async getVerificationStatus(@GetUser() user: User) {
    return await this.phoneVerificationService.getVerificationStatus(user.id);
  }
}