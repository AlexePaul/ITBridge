/**
 * Whether the backend is about to talk to real AWS with a static key pair — E07/S6.
 *
 * On EC2 the credential is the instance role: nothing to store, nothing to leak, nothing to rotate.
 * A pair in the environment is only right when `AWS_S3_ENDPOINT` points somewhere else — MinIO
 * locally and in CI, whose keys are throwaway values from `docker-compose.yml`. Against AWS itself
 * it is a long-lived secret the platform does not need, and the story's acceptance is that none
 * exists in any environment. The environment is not this repository's to see (it lives in SSM), so
 * the backend says so at boot, in the log a deploy is read by.
 */
export function usesStaticAwsKeys(env: { accessKeyId?: string; endpoint?: string }): boolean {
    return Boolean(env.accessKeyId) && !env.endpoint;
}
