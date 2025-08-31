import { IsOptional, IsString, IsNumber, Min, Max, IsEnum, IsPostalCode } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class SearchItemsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Page must be a number' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Limit must be a number' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Category ID must be a number' })
  categoryId?: number;

  @IsOptional()
  @IsString()
  @IsPostalCode('US', { message: 'Please provide a valid US ZIP code' })
  zipCode?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  searchTerm?: string;

  @IsOptional()
  @IsEnum(['created_at', 'title', 'expires_at'], {
    message: 'Sort by must be created_at, title, or expires_at',
  })
  sortBy?: 'created_at' | 'title' | 'expires_at' = 'created_at';

  @IsOptional()
  @IsEnum(['ASC', 'DESC'], {
    message: 'Sort order must be ASC or DESC',
  })
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'User ID must be a number' })
  excludeUserId?: number;

  // Location-based search parameters
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Latitude must be a number' })
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Longitude must be a number' })
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Radius must be a number' })
  @Min(1, { message: 'Radius must be at least 1 mile' })
  @Max(100, { message: 'Radius cannot exceed 100 miles' })
  radiusMiles?: number = 25;
}