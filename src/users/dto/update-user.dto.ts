import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsEnum, IsPhoneNumber, IsString, IsEmail, MinLength, MaxLength } from 'class-validator';
import { AccountStatus } from '../../common/enums/account-status.enum';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  profileImageUrl?: string;

  @IsOptional()
  @IsString()
  locationText?: string;

  @IsOptional()
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;

  @IsOptional()
  emailVerified?: boolean;

  @IsOptional()
  phoneVerified?: boolean;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsOptional()
  deactivatedAt?: Date;

  @IsOptional()
  reactivatedAt?: Date;

  @IsOptional()
  @IsString()
  deactivationReason?: string;
}