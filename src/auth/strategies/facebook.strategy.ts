import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';
import { SocialAuthService } from '../social-auth.service';
import { OAuthProvider } from '../../common/enums/oauth-provider.enum';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(
    private configService: ConfigService,
    private socialAuthService: SocialAuthService,
  ) {
    super({
      clientID: configService.get('FACEBOOK_CLIENT_ID'),
      clientSecret: configService.get('FACEBOOK_CLIENT_SECRET'),
      callbackURL: `${configService.get('BACKEND_URL', 'http://localhost:3000')}/auth/facebook/callback`,
      scope: ['email'],
      profileFields: ['id', 'emails', 'name', 'picture.type(large)'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (err: any, user: any, info?: any) => void,
  ): Promise<any> {
    try {
      const result = await this.socialAuthService.handleOAuthLogin(
        profile,
        OAuthProvider.FACEBOOK
      );
      
      done(null, result);
    } catch (error) {
      done(error, null);
    }
  }
}