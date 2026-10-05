/**
 * The screen map: every screen → the page file → the API routes it calls → the handler and the
 * service behind each. Rendered into `docs/harta-ecranelor.md`; `test/screen-map.spec.ts` fails when
 * the file is behind the sources.
 *
 * It exists for the bug that shows no error: a wrong number on a screen, a list missing a row. The
 * error record (E06 S1) points at a line of code when something throws; when nothing throws, the way
 * in is the screen itself, and this is the page's list of every request it makes and who answers it.
 *
 * Read from the sources rather than written by hand, like the data inventory: a map somebody keeps
 * up to date by memory is a map that is wrong the week after, and a wrong map sends the reader to
 * the wrong file with confidence. What it reads:
 *
 *   - `app/pages/**` — the screens, and what their scripts and templates call;
 *   - `app/components/**`, the top-level `app/composables/*.ts` and `app/stores/*.ts` — followed from
 *     the page, so a request made by a modal, a form or a store the page uses is on the page's list;
 *   - `app/layouts/**`, `app/plugins/**` and `app/middleware/**` — what every page of an area asks
 *     for around the page itself: the session, the menu's counts, the error reporter;
 *   - `app/composables/api/*.ts` — which function sends which request;
 *   - `apps/api/src/modules/**\/*.controller.ts` — which handler answers, and the service calls it
 *     makes, in the order they run.
 *
 * Usage: `pnpm --filter web screens:render` writes the file; `renderScreenMap()` returns the text.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WEB_APP = join(REPO, "apps", "web", "app");
const API_MODULES = join(REPO, "apps", "api", "src", "modules");
const API_SRC = join(REPO, "apps", "api", "src");
export const SCREEN_MAP_PATH = join(REPO, "docs", "harta-ecranelor.md");

const rel = (file) => relative(REPO, file).split("\\").join("/");

function walk(dir, keep) {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return walk(path, keep);
      return keep(path) ? [path] : [];
    });
}

const parse = (file, text) =>
  ts.createSourceFile(file, text ?? readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

/** `/profiles/${id}/claim` → `/profiles/:param/claim`; a `${…}` not after a `/` is a query suffix. */
function pathOf(node, locals) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isIdentifier(node) && locals.has(node.text)) return pathOf(locals.get(node.text), locals);
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) {
      if (!out.endsWith("/")) return out;
      out += ":param" + span.literal.text;
    }
    return out;
  }
  return null;
}

/** Leading slash, no query, parameters folded — the key both sides are matched on. */
const routeKey = (method, path) =>
  `${method} ${`/${path}`
    .replace(/\?.*$/, "")
    .replace(/\/+/g, "/")
    .replace(/\/:[^/]+/g, "/:param")
    .replace(/(.)\/$/, "$1")}`;

// ─────────────────────────────────────────────────────────── the API composables

/**
 * `useErrorsApi` → { fetchErrors: [{ method, path }], … }, and the same for each Pinia store
 * (`useUserStore` → { fetchUser: … }) and for `useApi` itself, whose refresh is a request too.
 *
 * Stores were left out at first, and with them `GET /auth/me`: the map listed it among the routes
 * no screen calls, when every page calls it (QA of 27 September 2026).
 */
function readApiComposables() {
  const out = new Map();
  const files = [
    ...walk(join(WEB_APP, "composables", "api"), (p) => p.endsWith(".ts")),
    ...walk(join(WEB_APP, "stores"), (p) => p.endsWith(".ts")),
  ];
  for (const file of files) {
    const source = parse(file);
    const text = source.getFullText();
    const composable =
      /export const (use\w+Store)\s*=\s*defineStore/.exec(text)?.[1] ??
      file.split("/").pop().replace(/\.ts$/, "");
    const functions = new Map();
    visit(source, (node) => {
      if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer)
        return;
      const init = node.initializer;
      if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) return;
      const locals = new Map();
      const endpoints = [];
      visit(init.body, (inner) => {
        if (ts.isVariableDeclaration(inner) && ts.isIdentifier(inner.name) && inner.initializer)
          locals.set(inner.name.text, inner.initializer);
        if (
          ts.isCallExpression(inner) &&
          ts.isIdentifier(inner.expression) &&
          // `api` in the composables and stores; `client` is `useApi`'s own, for the refresh.
          (inner.expression.text === "api" || inner.expression.text === "client")
        ) {
          const path = pathOf(inner.arguments[0], locals);
          if (!path) return;
          let method = "GET";
          const options = inner.arguments[1];
          if (options && ts.isObjectLiteralExpression(options)) {
            for (const prop of options.properties) {
              if (
                ts.isPropertyAssignment(prop) &&
                prop.name.getText(source) === "method" &&
                ts.isStringLiteralLike(prop.initializer)
              )
                method = prop.initializer.text.toUpperCase();
            }
          }
          endpoints.push({ method, path });
        }
      });
      if (endpoints.length) functions.set(node.name.text, endpoints);
    });
    out.set(composable, functions);
  }
  return out;
}

// ─────────────────────────────────────────────────────────── the controllers

function decoratorsOf(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorCall(decorator) {
  const call = decorator.expression;
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null;
  const arg = call.arguments[0];
  return {
    name: call.expression.text,
    arg: arg && ts.isStringLiteralLike(arg) ? arg.text : "",
  };
}

/** Where each class is declared, so a service type can be turned into a file. */
function readClassFiles() {
  const out = new Map();
  for (const file of walk(API_SRC, (p) => p.endsWith(".ts") && !p.endsWith(".spec.ts"))) {
    for (const match of readFileSync(file, "utf8").matchAll(/export class (\w+)/g)) {
      if (!out.has(match[1])) out.set(match[1], file);
    }
  }
  return out;
}

/** `GET /errors` → { controller, handler, file, service, serviceMethod, serviceFile } */
function readHandlers(classFiles) {
  const VERBS = { Get: "GET", Post: "POST", Put: "PUT", Patch: "PATCH", Delete: "DELETE" };
  const out = new Map();
  for (const file of walk(API_MODULES, (p) => p.endsWith(".controller.ts"))) {
    const source = parse(file);
    visit(source, (node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      const controller = decoratorsOf(node)
        .map(decoratorCall)
        .find((d) => d?.name === "Controller");
      if (!controller) return;
      const injected = new Map();
      for (const member of node.members) {
        if (!ts.isConstructorDeclaration(member)) continue;
        for (const param of member.parameters) {
          if (ts.isIdentifier(param.name) && param.type)
            injected.set(param.name.text, param.type.getText(source));
        }
      }
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.body) continue;
        const verb = decoratorsOf(member)
          .map(decoratorCall)
          .find((d) => d && VERBS[d.name]);
        if (!verb) continue;
        // Every service call, in the order it runs: children before parents, so in
        // `this.arrears.withBalances(await this.invoices.findInvoices())` the list is built first.
        // Only the first was kept, and it was the outer one, so `GET /invoices` named
        // `ArrearsService.withBalances` for a list `InvoiceService.findInvoices` builds (QA of 27
        // September 2026).
        const services = [];
        const collect = (inner) => {
          ts.forEachChild(inner, collect);
          if (!ts.isCallExpression(inner)) return;
          const callee = inner.expression;
          if (
            ts.isPropertyAccessExpression(callee) &&
            ts.isPropertyAccessExpression(callee.expression) &&
            callee.expression.expression.kind === ts.SyntaxKind.ThisKeyword
          ) {
            const type = injected.get(callee.expression.name.text);
            const method = callee.name.text;
            if (type && !services.some((s) => s.type === type && s.method === method))
              services.push({ type, method, file: classFiles.get(type) ?? null });
          }
        };
        collect(member.body);
        out.set(routeKey(VERBS[verb.name], `${controller.arg}/${verb.arg}`), {
          path: `/${[controller.arg, verb.arg].filter(Boolean).join("/")}`.replace(/\/+/g, "/"),
          method: VERBS[verb.name],
          controller: node.name.text,
          handler: member.name.getText(source),
          file,
          services,
        });
      }
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────── pages, components, helpers

const scriptOf = (text) =>
  [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

/** Nuxt's names for a component file: `admin/AdminPage.vue` → AdminPage, `x/Card.vue` → XCard. */
function componentNames(file) {
  const parts = relative(join(WEB_APP, "components"), file)
    .replace(/\.vue$/, "")
    .split("/");
  const pascal = (s) => s.replace(/(^|[-_])(\w)/g, (_m, _s, c) => c.toUpperCase());
  const base = pascal(parts.pop());
  const prefix = parts.map(pascal).join("");
  return [...new Set([base, base.startsWith(prefix) ? base : prefix + base])];
}

/** The API functions one file calls directly, as `useXApi.fn` keys. */
function directApiCalls(text, apiFunctions) {
  const calls = new Set();
  for (const match of text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(use\w+(?:Api|Store))\(\)/g)) {
    const [, variable, composable] = match;
    // Whitespace allowed around the dot: a call chained onto the next line (`errorsApi\n.fetch…()`)
    // was missed, and with it the menu's error count.
    for (const call of text.matchAll(new RegExp(`\\b${variable}\\s*\\.\\s*(\\w+)\\(`, "g")))
      if (apiFunctions.get(composable)?.has(call[1])) calls.add(`${composable}.${call[1]}`);
  }
  for (const match of text.matchAll(
    /(?:const|let)\s+\{([^}]*)\}\s*=\s*(use\w+(?:Api|Store))\(\)/g
  )) {
    const [, names, composable] = match;
    for (const part of names.split(",")) {
      const [original, alias] = part.split(":").map((s) => s.trim());
      if (!original) continue;
      const local = alias || original;
      if (
        apiFunctions.get(composable)?.has(original) &&
        new RegExp(`\\b${local}\\(`).test(text.replace(match[0], ""))
      )
        calls.add(`${composable}.${original}`);
    }
  }
  for (const match of text.matchAll(/\b(use\w+(?:Api|Store))\(\)\.(\w+)\(/g))
    if (apiFunctions.get(match[1])?.has(match[2])) calls.add(`${match[1]}.${match[2]}`);
  return calls;
}

function readWebFiles(apiFunctions) {
  const components = new Map();
  for (const file of walk(join(WEB_APP, "components"), (p) => p.endsWith(".vue"))) {
    for (const name of componentNames(file)) components.set(name, file);
  }
  // Top-level composables that wrap API calls (`useAuthForms`, `useProfileInitialization`…).
  const helpers = new Map();
  for (const file of walk(join(WEB_APP, "composables"), (p) => /\/composables\/\w+\.ts$/.test(p))) {
    const text = readFileSync(file, "utf8");
    const exported = [...text.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)].map(
      (m) => m[1]
    );
    for (const name of exported) helpers.set(name, file);
  }

  const cache = new Map();
  /** Everything a file reaches: its own calls, and those of the components and helpers it uses. */
  const reach = (file, seen = new Set()) => {
    if (seen.has(file)) return new Set();
    seen.add(file);
    if (cache.has(file)) return cache.get(file);
    const text = readFileSync(file, "utf8");
    const calls = directApiCalls(
      file.endsWith(".vue") ? scriptOf(text) + text : text,
      apiFunctions
    );
    for (const tag of new Set([...text.matchAll(/<([A-Z][A-Za-z0-9]+)/g)].map((m) => m[1]))) {
      const component = components.get(tag);
      if (component) for (const call of reach(component, seen)) calls.add(call);
    }
    for (const [name, helper] of helpers) {
      if (helper !== file && new RegExp(`\\b${name}\\(`).test(text))
        for (const call of reach(helper, seen)) calls.add(call);
    }
    cache.set(file, calls);
    return calls;
  };
  return { reach };
}

/** `pages/admin/profiles/[profileId]/index.vue` → `/admin/profiles/:profileId` */
function routeOfPage(file) {
  const path = relative(join(WEB_APP, "pages"), file)
    .replace(/\.vue$/, "")
    .split("/")
    .filter((part) => part !== "index")
    .map((part) => part.replace(/^\[(\w+)\]$/, ":$1"))
    .join("/");
  return `/${path}`;
}

function titleOfPage(text) {
  return (
    /definePageMeta\(\{[\s\S]*?\btitle:\s*"([^"]+)"/.exec(text)?.[1] ??
    /<AdminPage[\s\S]*?\btitle="([^"]+)"/.exec(text)?.[1] ??
    ""
  );
}

const AREAS = [
  ["/admin", "Zona de admin"],
  ["/user", "Portalul părintelui"],
  ["/auth", "Autentificare și cont"],
  ["", "Site-ul public și paginile fără cont"],
];

/**
 * What surrounds every page of an area: the layouts, the plugins and the global middleware, with a
 * sentence saying when each runs. A layout's requests are on every screen it frames — the menu's
 * counts on every admin page — and were on no list (QA of 27 September 2026).
 */
const SURROUNDINGS = [
  ["layouts/dashboard.vue", "în jurul fiecărei pagini de admin: cifrele din meniu și locațiile"],
  ["layouts/portal.vue", "în jurul fiecărei pagini a portalului"],
  ["plugins/01.auth.client.ts", "la încărcarea oricărei pagini, cu o sesiune salvată"],
  ["plugins/03.profile.client.ts", "la încărcarea oricărei pagini, pentru un părinte"],
  ["plugins/05.error-report.client.ts", "când un ecran se strică în browser"],
  ["middleware/01.auth.global.ts", "la fiecare navigare"],
  ["middleware/02.profile-setup.global.ts", "la fiecare navigare"],
  ["middleware/03.legal-acceptance.global.ts", "la fiecare navigare"],
];

export function renderScreenMap() {
  const apiFunctions = readApiComposables();
  const handlers = readHandlers(readClassFiles());
  const { reach } = readWebFiles(apiFunctions);
  const called = new Set();

  const requestsOf = (file) => {
    const requests = new Map();
    for (const call of reach(file)) {
      const [composable, fn] = call.split(".");
      for (const endpoint of apiFunctions.get(composable).get(fn)) {
        const key = routeKey(endpoint.method, endpoint.path);
        called.add(key);
        if (!requests.has(key))
          requests.set(key, { key, fns: new Set(), handler: handlers.get(key) });
        requests.get(key).fns.add(call);
      }
    }
    return requests;
  };

  const pages = walk(join(WEB_APP, "pages"), (p) => p.endsWith(".vue")).map((file) => {
    const text = readFileSync(file, "utf8");
    return { file, route: routeOfPage(file), title: titleOfPage(text), requests: requestsOf(file) };
  });

  const surroundings = SURROUNDINGS.map(([path, when]) => {
    const file = join(WEB_APP, path);
    return { file, when, requests: requestsOf(file) };
  });

  // `useApi` refreshes the session itself, for any request that meets a 401: a request too.
  const refresh = [...(apiFunctions.get("useApi")?.values() ?? [])].flat();
  for (const endpoint of refresh) called.add(routeKey(endpoint.method, endpoint.path));

  const requestTable = (requests) => {
    const rows = ["| Cerere | Răspunde | Serviciile |", "| --- | --- | --- |"];
    for (const request of [...requests.values()].sort((a, b) => a.key.localeCompare(b.key))) {
      const handler = request.handler;
      const answer = handler
        ? `\`${handler.controller}.${handler.handler}\` în \`${rel(handler.file)}\``
        : "— nicio rută cu forma asta în API";
      const services = handler?.services.length
        ? handler.services
            .map(
              (service) =>
                `\`${service.type}.${service.method}\`${service.file ? ` în \`${rel(service.file)}\`` : ""}`
            )
            .join(", apoi ")
        : "—";
      rows.push(
        `| \`${handler ? `${handler.method} ${handler.path}` : request.key}\` | ${answer} | ${services} |`
      );
    }
    return rows;
  };

  const lines = [
    "# Harta ecranelor",
    "",
    "Fiecare ecran, fișierul lui, cererile pe care le face către API și cine le răspunde: controllerul",
    "și serviciile pe care le cheamă, în ordinea în care rulează. Pentru bug-ul care nu dă nicio eroare",
    "— un număr greșit, un rând lipsă —, unde codul de pe ecran nu există: pornești de la ecranul pe care",
    'îl vezi. Vezi și [runbook.md](runbook.md), „Un bug".',
    "",
    "**Generat din surse, nu scris de mână**: `pnpm --filter web screens:render` îl rescrie, iar",
    "`apps/web/test/screen-map.spec.ts` pică dacă a rămas în urmă. Urmează pagina, componentele pe care",
    "le desenează, composable-urile și magazinele Pinia pe care le cheamă; o cerere făcută altfel (un",
    "`$fetch` direct) nu apare.",
    "",
    "## Pe fiecare pagină",
    "",
    "Cererile din jurul paginii: layout-ul, pluginurile și middleware-ul. Nu sunt repetate sub fiecare",
    "ecran; dacă un număr din meniu e greșit, aici e cererea lui.",
    "",
  ];

  for (const surrounding of surroundings) {
    lines.push(`### \`${rel(surrounding.file)}\` — ${surrounding.when}`, "");
    if (!surrounding.requests.size) {
      lines.push("Nu face nicio cerere către API.", "");
      continue;
    }
    lines.push(...requestTable(surrounding.requests), "");
  }
  if (refresh.length) {
    lines.push(
      "### `apps/web/app/composables/api/useApi.ts` — la orice cerere care primește 401",
      "",
      ...requestTable(
        new Map(
          refresh.map((endpoint) => {
            const key = routeKey(endpoint.method, endpoint.path);
            return [key, { key, fns: new Set(), handler: handlers.get(key) }];
          })
        )
      ),
      ""
    );
  }

  for (const [prefix, heading] of AREAS) {
    const inArea = pages.filter(
      (page) =>
        page.route.startsWith(prefix) &&
        !AREAS.some(([other]) => other.length > prefix.length && page.route.startsWith(other))
    );
    if (!inArea.length) continue;
    lines.push(`## ${heading}`, "");
    for (const page of inArea.sort((a, b) => a.route.localeCompare(b.route))) {
      lines.push(`### \`${page.route}\`${page.title ? ` — ${page.title}` : ""}`, "");
      lines.push(`Pagina: \`${rel(page.file)}\``, "");
      if (!page.requests.size) {
        lines.push("Nu face nicio cerere către API.", "");
        continue;
      }
      lines.push(...requestTable(page.requests), "");
    }
  }

  const unused = [...handlers.entries()]
    .filter(([key]) => !called.has(key))
    .sort(([a], [b]) => a.localeCompare(b));
  lines.push(
    "## Rute pe care nu le cheamă niciun ecran",
    "",
    "Unele au alt client — agentul din birou, un job, un link din email —, altele sunt drumuri vechi",
    "păstrate pe server. Nu sunt neapărat de șters; sunt locul în care nu caută nimeni când se strică ceva",
    "pe un ecran.",
    ""
  );
  for (const [, handler] of unused)
    lines.push(
      `- \`${handler.method} ${handler.path}\` — \`${handler.controller}.${handler.handler}\``
    );
  lines.push("");
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(SCREEN_MAP_PATH, renderScreenMap());
  console.log(`Wrote ${rel(SCREEN_MAP_PATH)}`);
}
