import { IsString, IsPhoneNumber, Length, Matches } from 'class-validator';

export class InitiatePhoneVerificationDto {
  @IsPhoneNumber()
  phoneNumber: string;
}

export class VerifyPhoneDto {
  @IsString()
  @Length(6, 6, { message: 'Verification code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'Verification code must contain only digits' })
  verificationCode: string;
}

export class UpdatePhoneNumberDto {
  @IsPhoneNumber()
  phoneNumber: string;
}