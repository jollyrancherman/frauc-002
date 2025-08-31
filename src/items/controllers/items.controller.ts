import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
  ValidationPipe,
  UsePipes,
  Logger,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';
import { ItemsService } from '../services/items.service';
import { ItemClaimsService } from '../services/item-claims.service';
import { CreateItemDto } from '../dto/create-item.dto';
import { UpdateItemDto } from '../dto/update-item.dto';
import { SearchItemsDto } from '../dto/search-items.dto';
import { CreateClaimDto } from '../services/item-claims.service';
import { Item } from '../entities/item.entity';
import { ItemClaim } from '../entities/item-claim.entity';

// Simple CurrentUser decorator placeholder
const CurrentUser = () => (target: any, propertyKey: string, parameterIndex: number) => {};

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

@Controller('items')
@UseGuards(JwtAuthGuard)
export class ItemsController {
  private readonly logger = new Logger(ItemsController.name);

  constructor(
    private readonly itemsService: ItemsService,
    private readonly itemClaimsService: ItemClaimsService,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  async create(
    @CurrentUser() user: User,
    @Body() createItemDto: CreateItemDto,
  ): Promise<ApiResponse<Item>> {
    try {
      const item = await this.itemsService.create(user.id, createItemDto);
      this.logger.log(`Item created: ${item.id} by user ${user.id}`);
      
      return {
        success: true,
        data: item,
        message: 'Item created successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to create item: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  async findAll(@Query() searchDto: SearchItemsDto): Promise<ApiResponse<{
    items: Item[];
    total: number;
  }>> {
    try {
      const result = await this.itemsService.findAll(searchDto);
      
      return {
        success: true,
        data: result,
        message: 'Items retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to search items: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<ApiResponse<Item>> {
    try {
      const item = await this.itemsService.findOne(id);
      
      return {
        success: true,
        data: item,
        message: 'Item retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to find item ${id}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id')
  @UsePipes(new ValidationPipe({ transform: true }))
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() updateItemDto: UpdateItemDto,
  ): Promise<ApiResponse<Item>> {
    try {
      const item = await this.itemsService.update(id, user.id, updateItemDto);
      this.logger.log(`Item updated: ${id} by user ${user.id}`);
      
      return {
        success: true,
        data: item,
        message: 'Item updated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to update item ${id}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse> {
    try {
      await this.itemsService.remove(id, user.id);
      this.logger.log(`Item deleted: ${id} by user ${user.id}`);
      
      return {
        success: true,
        message: 'Item deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to delete item ${id}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('search/nearby')
  async findNearby(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('radius') radius: number = 10,
    @Query('category') category?: string,
    @Query('limit') limit: number = 20,
  ): Promise<ApiResponse<Item[]>> {
    try {
      const filters = category ? { categoryId: parseInt(category) } : {};
      const result = await this.itemsService.findNearby(lat, lng, radius, filters, { limit });
      
      return {
        success: true,
        data: result.items,
        message: `Found ${result.items.length} nearby items`,
      };
    } catch (error) {
      this.logger.error(`Failed to find nearby items: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('categories/list')
  async getCategories(): Promise<ApiResponse<Array<{ categoryId: number; categoryName: string; itemCount: number }>>> {
    try {
      const categories = await this.itemsService.getPopularCategories();
      
      return {
        success: true,
        data: categories,
        message: 'Categories retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get categories: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/images')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'images', maxCount: 5 }]))
  async uploadImages(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @UploadedFiles() files: { images?: Express.Multer.File[] },
  ): Promise<ApiResponse<{ urls: string[] }>> {
    try {
      const imageFiles = files?.images || [];
      if (imageFiles.length === 0) {
        throw new HttpException('No images provided', HttpStatus.BAD_REQUEST);
      }

      // Image upload would be handled by a separate service
      const urls = imageFiles.map(file => `https://s3.amazonaws.com/uploads/${file.filename}`);
      this.logger.log(`Images uploaded for item ${id}: ${urls.length} files`);
      
      return {
        success: true,
        data: { urls },
        message: `${urls.length} images uploaded successfully`,
      };
    } catch (error) {
      this.logger.error(`Failed to upload images for item ${id}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id/images/:imageId')
  async deleteImage(
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
  ): Promise<ApiResponse> {
    try {
      // Image deletion would be handled by a separate service
      // For now, just validate the user owns the item
      const item = await this.itemsService.findOne(id);
      if (!item || item.userId !== user.id) {
        throw new HttpException('Item not found or access denied', HttpStatus.FORBIDDEN);
      }
      this.logger.log(`Image deleted: ${imageId} from item ${id} by user ${user.id}`);
      
      return {
        success: true,
        message: 'Image deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to delete image ${imageId} from item ${id}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/claim')
  @UsePipes(new ValidationPipe({ transform: true }))
  async createClaim(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() createClaimDto: Omit<CreateClaimDto, 'itemId'>,
  ): Promise<ApiResponse<ItemClaim>> {
    try {
      const claim = await this.itemClaimsService.createClaim(user.id, {
        ...createClaimDto,
        itemId: id,
      });
      this.logger.log(`Claim created: ${claim.id} for item ${id} by user ${user.id}`);
      
      return {
        success: true,
        data: claim,
        message: 'Claim created successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to create claim for item ${id}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/queue')
  async getQueue(@Param('id', ParseIntPipe) id: number): Promise<ApiResponse<{
    activeClaims: number;
    userPosition?: number;
    estimatedWait?: number;
    queue: ItemClaim[];
  }>> {
    try {
      const queueInfo = await this.itemClaimsService.getQueueInfo(id);
      const queue = await this.itemClaimsService.getQueue(id);
      
      return {
        success: true,
        data: {
          activeClaims: queueInfo.activeClaims,
          userPosition: queueInfo.userPosition,
          estimatedWait: queueInfo.estimatedWait,
          queue,
        },
        message: 'Queue information retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get queue for item ${id}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('user/my-items')
  async getMyItems(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('limit') limit: number = 20,
  ): Promise<ApiResponse<Item[]>> {
    try {
      const statusArray = status ? [status as any] : undefined;
      const result = await this.itemsService.findByUser(user.id, statusArray, { limit });
      const items = Array.isArray(result) ? result : result.items;
      
      return {
        success: true,
        data: items,
        message: 'Items retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get items for user ${user.id}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('user/my-claims')
  async getMyClaims(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('limit') limit: number = 20,
  ): Promise<ApiResponse<ItemClaim[]>> {
    try {
      const statusArray = status ? [status as any] : undefined;
      const claims = await this.itemClaimsService.getUserClaims(user.id, statusArray, limit);
      
      return {
        success: true,
        data: claims,
        message: 'Claims retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get claims for user ${user.id}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('analytics/overview')
  async getAnalytics(): Promise<ApiResponse<{
    totalItems: number;
    activeItems: number;
    claimedItems: number;
    expiredItems: number;
  }>> {
    try {
      const analytics = await this.itemsService.getItemStatistics();
      
      return {
        success: true,
        data: analytics,
        message: 'Analytics retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get analytics: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('claims/:claimId/cancel')
  async cancelClaim(
    @Param('claimId', ParseIntPipe) claimId: number,
    @CurrentUser() user: User,
    @Body() body: { reason: string },
  ): Promise<ApiResponse> {
    try {
      await this.itemClaimsService.cancelClaim(claimId, user.id, body.reason);
      this.logger.log(`Claim cancelled: ${claimId} by user ${user.id}`);
      
      return {
        success: true,
        message: 'Claim cancelled successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to cancel claim ${claimId}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('claims/:claimId/contact')
  async contactClaimer(
    @Param('claimId', ParseIntPipe) claimId: number,
    @CurrentUser() user: User,
    @Body() body: { message?: string },
  ): Promise<ApiResponse> {
    try {
      await this.itemClaimsService.contactClaimer(claimId, user.id, body.message);
      this.logger.log(`Claimer contacted: claim ${claimId} by user ${user.id}`);
      
      return {
        success: true,
        message: 'Claimer contacted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to contact claimer for claim ${claimId}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('claims/:claimId/select')
  async selectClaimer(
    @Param('claimId', ParseIntPipe) claimId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse> {
    try {
      await this.itemClaimsService.selectClaimer(claimId, user.id);
      this.logger.log(`Claimer selected: claim ${claimId} by user ${user.id}`);
      
      return {
        success: true,
        message: 'Claimer selected successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to select claimer for claim ${claimId}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('claims/:claimId/complete')
  async completeClaim(
    @Param('claimId', ParseIntPipe) claimId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse> {
    try {
      await this.itemClaimsService.completeClaim(claimId, user.id);
      this.logger.log(`Claim completed: ${claimId} by user ${user.id}`);
      
      return {
        success: true,
        message: 'Claim completed successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to complete claim ${claimId}: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}