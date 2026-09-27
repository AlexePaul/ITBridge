// Stack traces in the TypeScript that was written, not the JavaScript `nest build` emitted — E06 S1.
//
// The error screen shows the stack of every 500, and `dist/modules/invoice/invoice.service.js:212`
// is a line nobody wrote: the person fixing the bug would have to rebuild the same commit to find
// out where it points. `tsconfig.json` already emits the maps; this turns on Node's own reading of
// them, which is `--enable-source-maps` without depending on how PM2 starts the process.
//
// Only modules loaded *after* this line are mapped, so `main.ts` imports it second, right after
// `load-env` — which stays first, as CLAUDE.md asks — and before anything that could throw.
process.setSourceMapsEnabled(true);
