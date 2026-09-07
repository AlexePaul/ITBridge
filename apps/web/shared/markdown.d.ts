/**
 * Nitro bundles a `.md` import as its text; TypeScript has to be told so.
 *
 * In `shared/` rather than `server/` because two type projects read the route that imports the
 * files: the server one, and the app one, which pulls every route in through the generated
 * `nitro-routes.d.ts` to type `useFetch`. `shared/**\/*.d.ts` is the one include both have.
 */
declare module "*.md" {
  const source: string;
  export default source;
}
