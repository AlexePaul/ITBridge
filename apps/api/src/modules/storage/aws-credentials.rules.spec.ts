import { usesStaticAwsKeys } from './aws-credentials.rules';

describe('usesStaticAwsKeys', () => {
    it('flags a key pair aimed at AWS itself', () => {
        expect(usesStaticAwsKeys({ accessKeyId: 'AKIA-anything' })).toBe(true);
    });

    // MinIO locally and in CI: throwaway keys from docker-compose, nowhere near AWS.
    it('leaves a pair aimed at another endpoint alone', () => {
        expect(usesStaticAwsKeys({ accessKeyId: 'itbridge', endpoint: 'http://localhost:9000' })).toBe(false);
    });

    it('leaves the instance role alone', () => {
        expect(usesStaticAwsKeys({})).toBe(false);
        expect(usesStaticAwsKeys({ accessKeyId: '' })).toBe(false);
    });
});
