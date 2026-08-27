/**
 * JWT settings, read once from an environment that `validateEnv` has already checked.
 *
 * The `|| 'defaultAccessSecret'` fallbacks that used to live here are gone: an application
 * configured without secrets now refuses to boot instead of signing tokens with a value published
 * in this repository. See E05/S3.
 */
export class jwtConstants {
    static readonly accessTokenSecret = process.env.JWT_ACCESS_TOKEN_SECRET as string;
    static readonly refreshTokenSecret = process.env.JWT_REFRESH_TOKEN_SECRET as string;
    static readonly accessTokenExpiration: number = Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION) || 900;
    static readonly refreshTokenExpiration: number = Number(process.env.JWT_REFRESH_TOKEN_EXPIRATION) || 604800;
}
