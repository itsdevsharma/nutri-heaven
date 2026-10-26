import { JwtService } from '@nestjs/jwt';

/**
 * Verify with the current signing key first, then with the previous key during
 * a planned rotation window. New tokens are always signed with the current
 * key by JwtModule. Remove JWT_ACCESS_SECRET_PREVIOUS after every pre-rotation
 * token has expired (currently seven days for customer sessions).
 */
export async function verifyWithRotatedJwtSecret<T extends object>(jwt: JwtService, token: string): Promise<T> {
  try {
    return await jwt.verifyAsync<T>(token);
  } catch (currentSecretError) {
    const previousSecret = process.env.JWT_ACCESS_SECRET_PREVIOUS?.trim();
    if (!previousSecret || previousSecret === process.env.JWT_ACCESS_SECRET) throw currentSecretError;
    return jwt.verifyAsync<T>(token, { secret: previousSecret });
  }
}
