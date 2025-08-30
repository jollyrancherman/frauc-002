export interface JwtPayload {
  sub: number; // User ID
  email: string;
  firstName: string;
  lastName: string;
  iat?: number;
  exp?: number;
}