/**
 * Environment for the unit suites, applied before any module is imported.
 *
 * `jwtConstants` reads these at load time and no longer falls back to a default — that was the
 * point of E05/S3 — so the tests have to supply them like any other caller would.
 */
process.env.JWT_ACCESS_TOKEN_SECRET ??= 'unit-test-access-secret';
process.env.JWT_REFRESH_TOKEN_SECRET ??= 'unit-test-refresh-secret';
