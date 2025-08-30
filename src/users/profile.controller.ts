import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Req,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users/profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getProfile(@GetUser() user: User) {
    return await this.profileService.getProfile(user.id);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 updates per minute
  async updateProfile(
    @GetUser() user: User,
    @Body() updateData: UpdateUserDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    return await this.profileService.updateProfile(user.id, updateData, ipAddress);
  }

  @Post('image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image'))
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 uploads per 5 minutes
  async uploadProfileImage(
    @GetUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    return await this.profileService.uploadProfileImage(user.id, file);
  }

  @Delete('image')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 deletions per minute
  async deleteProfileImage(@GetUser() user: User) {
    return await this.profileService.deleteProfileImage(user.id);
  }

  @Post('deactivate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 1, ttl: 3600000 } }) // 1 deactivation per hour
  async deactivateAccount(
    @GetUser() user: User,
    @Body() body: { reason?: string },
  ) {
    return await this.profileService.deactivateAccount(user.id, body.reason);
  }

  @Post('reactivate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 reactivations per hour
  async reactivateAccount(@GetUser() user: User) {
    return await this.profileService.reactivateAccount(user.id);
  }

  @Get('export')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 1, ttl: 3600000 } }) // 1 export per hour
  async exportUserData(
    @GetUser() user: User,
    @Query('format') format: 'json' | 'csv' = 'json',
  ) {
    if (!['json', 'csv'].includes(format)) {
      throw new BadRequestException('Format must be either json or csv');
    }

    return await this.profileService.exportUserData(user.id, format);
  }
}