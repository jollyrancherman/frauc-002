import { User } from '../../users/entities/user.entity';

export interface AuthResponse {
  user: Partial<User>;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}