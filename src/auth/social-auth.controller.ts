import {
  Controller,
  Get,
  Post,
  Delete,
  UseGuards,
  Req,
  Res,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { SocialAuthService } from './social-auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import { Public } from './decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { OAuthProvider } from '../common/enums/oauth-provider.enum';

@Controller('auth')
export class SocialAuthController {
  constructor(private readonly socialAuthService: SocialAuthService) {}

  // Google OAuth routes
  @Get('google')
  @Public()
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req: Request) {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @Public()
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    try {
      const result = req.user as any;
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      
      if (result && result.tokens) {
        // Redirect to frontend with tokens
        const redirectUrl = `${frontendUrl}/auth/success?` +
          `access_token=${result.tokens.accessToken}&` +
          `refresh_token=${result.tokens.refreshToken}&` +
          `new_user=${result.isNewUser}`;
        
        res.redirect(redirectUrl);
      } else {
        // Fallback: redirect to error page with fallback option
        res.redirect(`${frontendUrl}/auth/error?` +
          `message=google_auth_failed&` +
          `fallback=email_registration&` +
          `provider=google`);
      }
    } catch (error) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/error?` +
        `message=google_auth_error&` +
        `fallback=email_registration&` +
        `provider=google`);
    }
  }

  // Facebook OAuth routes
  @Get('facebook')
  @Public()
  @UseGuards(AuthGuard('facebook'))
  async facebookAuth(@Req() req: Request) {
    // Guard redirects to Facebook
  }

  @Get('facebook/callback')
  @Public()
  @UseGuards(AuthGuard('facebook'))
  async facebookAuthRedirect(@Req() req: Request, @Res() res: Response) {
    try {
      const result = req.user as any;
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      
      if (result && result.tokens) {
        const redirectUrl = `${frontendUrl}/auth/success?` +
          `access_token=${result.tokens.accessToken}&` +
          `refresh_token=${result.tokens.refreshToken}&` +
          `new_user=${result.isNewUser}`;
        
        res.redirect(redirectUrl);
      } else {
        // Fallback: redirect to error page with fallback option
        res.redirect(`${frontendUrl}/auth/error?` +
          `message=facebook_auth_failed&` +
          `fallback=email_registration&` +
          `provider=facebook`);
      }
    } catch (error) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/error?` +
        `message=facebook_auth_error&` +
        `fallback=email_registration&` +
        `provider=facebook`);
    }
  }

  // Apple Sign In route
  @Post('apple')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async appleAuth(@Body() appleData: { id_token: string; user?: any }) {
    try {
      // In a real implementation, you would verify the Apple ID token
      // For now, we'll create a mock profile from the token data
      const mockProfile = {
        id: 'apple_user_id', // Extract from verified JWT
        emails: appleData.user?.email ? [{ value: appleData.user.email }] : [],
        name: appleData.user?.name ? {
          givenName: appleData.user.name.firstName,
          familyName: appleData.user.name.lastName,
        } : {},
        provider: 'apple',
      };

      const result = await this.socialAuthService.handleOAuthLogin(
        mockProfile,
        OAuthProvider.APPLE
      );

      return {
        success: true,
        data: result,
        message: 'Apple Sign In successful',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Apple Sign In failed. You can try email registration instead.',
        fallback: {
          method: 'email_registration',
          url: '/auth/register/initiate',
        },
      };
    }
  }

  // Fallback endpoint for OAuth failures - helps users recover
  @Get('oauth-fallback/:provider')
  @Public()
  async oauthFallback(@Param('provider') provider: string) {
    return {
      success: false,
      message: `${provider} authentication failed`,
      fallback_options: [
        {
          method: 'email_registration',
          title: 'Sign up with Email',
          description: 'Create an account using your email address',
          url: '/auth/register/initiate',
        },
        {
          method: 'try_again',
          title: `Try ${provider} Again`,
          description: 'Retry the OAuth authentication',
          url: `/auth/${provider.toLowerCase()}`,
        },
        {
          method: 'different_provider',
          title: 'Try Different Provider',
          description: 'Use a different social login option',
          providers: ['google', 'facebook', 'apple'].filter(p => p !== provider.toLowerCase()),
        },
      ],
    };
  }

  // Get user's connected social accounts
  @Get('social-accounts')
  @UseGuards(JwtAuthGuard)
  async getSocialAccounts(@GetUser() user: User) {
    const accounts = await this.socialAuthService.getUserSocialAccounts(user.id);
    return {
      success: true,
      data: accounts,
    };
  }

  // Disconnect a social account
  @Delete('social-accounts/:provider')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async disconnectSocialAccount(
    @GetUser() user: User,
    @Param('provider') provider: string,
  ) {
    const providerEnum = provider.toUpperCase() as OAuthProvider;
    
    if (!Object.values(OAuthProvider).includes(providerEnum)) {
      return {
        success: false,
        message: 'Invalid OAuth provider',
      };
    }

    return await this.socialAuthService.disconnectSocialAccount(user.id, providerEnum);
  }

  // Link a social account to existing user (for authenticated users)
  @Post('link/:provider')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async linkSocialAccount(
    @GetUser() user: User,
    @Param('provider') provider: string,
    @Body() linkData: { profile: any },
  ) {
    const providerEnum = provider.toUpperCase() as OAuthProvider;
    
    if (!Object.values(OAuthProvider).includes(providerEnum)) {
      return {
        success: false,
        message: 'Invalid OAuth provider',
      };
    }

    return await this.socialAuthService.linkSocialAccount(
      user.id,
      linkData.profile,
      providerEnum
    );
  }
}