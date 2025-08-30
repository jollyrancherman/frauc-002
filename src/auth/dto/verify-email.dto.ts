import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsString()
  @Length(6, 6, { message: 'Verification code must be exactly 6 digits' })
  verificationCode: string;
}