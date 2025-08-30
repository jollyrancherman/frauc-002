import { IsOptional, IsString, IsPhoneNumber, MaxLength, IsDate, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CompleteProfileDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Location cannot exceed 255 characters' })
  locationText?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Please provide a valid date of birth' })
  @ValidateIf((o, value) => {
    if (value) {
      const today = new Date();
      return new Date(value) <= today;
    }
    return true;
  })
  dateOfBirth?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Profile image URL cannot exceed 255 characters' })
  profileImageUrl?: string;
}