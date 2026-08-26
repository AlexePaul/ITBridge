export class jwtConstants {
    static readonly accessTokenSecret = process.env.JWT_ACCESS_TOKEN_SECRET || 'defaultAccessSecret';
    static readonly refreshTokenSecret = process.env.JWT_REFRESH_TOKEN_SECRET || 'defaultRefreshSecret';
    static readonly accessTokenExpiration: number = Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION) || 900;
    static readonly refreshTokenExpiration: number = Number(process.env.JWT_REFRESH_TOKEN_EXPIRATION) || 604800;
}
