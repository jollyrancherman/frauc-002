import { IsString, IsNumber, IsOptional, IsEnum, MaxLength, MinLength, IsPostalCode } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateItemDto {
  @IsString()
  @MinLength(5, { message: 'Title must be at least 5 characters long' })
  @MaxLength(100, { message: 'Title must not exceed 100 characters' })
  @Transform(({ value }) => value?.trim())
  title: string;

  @IsString()
  @MinLength(10, { message: 'Description must be at least 10 characters long' })
  @MaxLength(1000, { message: 'Description must not exceed 1000 characters' })
  @Transform(({ value }) => value?.trim())
  description: string;

  @IsNumber({}, { message: 'Category ID must be a number' })
  categoryId: number;

  @IsString()
  @IsPostalCode('US', { message: 'Please provide a valid US ZIP code' })
  zipCode: string;

  @IsEnum(['email', 'phone', 'both'], {
    message: 'Contact method must be email, phone, or both',
  })
  contactMethod: 'email' | 'phone' | 'both';

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Pickup instructions must not exceed 500 characters' })
  @Transform(({ value }) => value?.trim())
  pickupInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Pickup address must not exceed 200 characters' })
  @Transform(({ value }) => value?.trim())
  pickupAddress?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Latitude must be a number' })
  latitude?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Longitude must be a number' })
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Special requirements must not exceed 200 characters' })
  @Transform(({ value }) => value?.trim())
  specialRequirements?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Days until expiration must be a number' })
  daysUntilExpiration?: number = 14; // Default 14 days
}