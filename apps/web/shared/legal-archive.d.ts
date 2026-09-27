/**
 * `#legal-archive`, the module `nuxt.config.ts` writes when the server is built: every kept version
 * of a legal text, keyed `<document>/<version>`, to its Markdown.
 *
 * In `shared/` for the reason `markdown.d.ts` is: the app's type project reads the server routes
 * too, to type `useFetch`, and `shared/**\/*.d.ts` is the include both projects have.
 */
declare module "#legal-archive" {
  const texts: Record<string, string>;
  export default texts;
}
