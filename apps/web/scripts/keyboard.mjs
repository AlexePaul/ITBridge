/**
 * The keyboard half of E18/S6 — what axe cannot see, because it reads the DOM and never presses
 * a key.
 *
 * The story's acceptance asks for full keyboard navigation and visible focus, and until now both
 * were verified by hand, once, when S5b rewrote the screens. That pass found four controls that were
 * `div`s with an `@click` — group cards, search results, a group picker, the add-a-child cards —
 * none of which any axe rule reports, because to a rule engine a `div` with a listener is text.
 * Nothing kept that true afterwards. This does, on every page both gates visit:
 *
 * - **A Tab walk from the top of the page to the bottom.** Every stop has to be something you can
 *   see, and it has to look different while it has focus. The walk has to reach the end, since a
 *   walk that never gets there is a trap.
 * - **Every element that listens for a click and looks clickable has to be reachable by the
 *   keyboard.** Where that is `role="button"` on something that isn't a button, something has to
 *   listen for the keys as well — a `<tr>` does not get Enter for free, the way a `<button>` does.
 *
 * Both return problems in the shape of an axe violation, so the reporting in the two gates does not
 * need to know where a problem came from.
 */

/**
 * Transitions off, so a style read the instant focus lands is the style focus produces.
 *
 * Tailwind's `transition-colors` sits on half the controls in the app, and a snapshot taken during
 * the first frame of it reads the unfocused colour. Waiting out every transition on every stop would
 * multiply the run by the number of stops; turning them off costs one style tag.
 */
const NO_TRANSITIONS =
  "*, *::before, *::after { transition: none !important; animation: none !important; }";

/**
 * The walk stops here, because no page this app draws needs this many stops.
 *
 * The longest measured screen has a little over a hundred. A walk that reaches the cap has almost
 * certainly been caught somewhere it cannot leave, and reporting that is the point.
 */
const MAX_STOPS = 400;

/**
 * Everything the keyboard reaches, as a check. Call it on a page that has finished loading.
 */
export async function keyboardProblemsOn(page) {
  await untilHydrated(page);
  await page.addStyleTag({ content: NO_TRANSITIONS });
  return [...(await tabWalkProblems(page)), ...(await clickablesTheKeyboardMisses(page))];
}

/**
 * Waits for Nuxt to finish hydrating, and fails if it cannot tell.
 *
 * Vue attaches every `@click` during hydration, so a check that runs before it sees no listeners
 * at all and passes, silently. That was found by planting a defect: the plant went in before
 * hydration, and hydration deleted it as a node the server never rendered. `isHydrating` is
 * Nuxt's own flag. Screens that are not server-rendered never hydrate, and read false from the
 * start.
 */
export async function untilHydrated(page) {
  try {
    await page.waitForFunction(
      () =>
        document.getElementById("__nuxt")?.__vue_app__?.config?.globalProperties?.$nuxt
          ?.isHydrating === false,
      null,
      { timeout: 15_000 }
    );
  } catch (cause) {
    throw new Error(
      `${page.url()} did not report that it had finished hydrating, so its click handlers may not be attached yet — and a check that finds none passes. If Nuxt moved its hydration flag, this is the line to update.`,
      { cause }
    );
  }
}

/**
 * Runs in the page. Installs the two readings the walk compares: how an element and its
 * neighbours look with nothing focused, and how they look now.
 *
 * **The comparison is against the page with nothing focused, not against the previous stop.**
 * Comparing with the previous stop masks a missing indicator whenever the next stop is a sibling:
 * the sibling's own focus ring shows up as "something changed" for the control that has none.
 *
 * **Neighbours count, because focus is not always drawn on the focused element.** A visually hidden
 * native input shows its focus through the label next to it, and a field can show it on its wrapper
 * through `:focus-within`. So the reading covers the element, its `::before` and `::after`, its
 * parent, its two siblings and its label. Any of them changing is an indicator a sighted reader can
 * follow.
 */
function installReadings() {
  const PROPS = [
    "outline-style",
    "outline-width",
    "outline-color",
    "outline-offset",
    "box-shadow",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "background-color",
    "background-image",
    "color",
    "text-decoration-line",
    "text-decoration-color",
    "text-decoration-thickness",
    "opacity",
    "transform",
  ];
  // Only what can be drawn. The global `:focus-visible` rule sets `outline-offset: 2px`, so an
  // element whose outline was taken away still "changed" on focus — by moving an outline it did
  // not have. A planted `outline: none` on the footer links passed that way, which is how this was
  // found. So: outline properties only while there is an outline, a border's colour only where the
  // border has a width, and a pseudo-element only when it renders.
  const read = (el, pseudo) => {
    if (!el) return "";
    const style = getComputedStyle(el, pseudo);
    if (pseudo && style.getPropertyValue("content") === "none") return "";
    const outlined =
      style.getPropertyValue("outline-style") !== "none" &&
      parseFloat(style.getPropertyValue("outline-width")) > 0;
    return PROPS.map((prop) => {
      if (prop.startsWith("outline") && !outlined) return "";
      const side = prop.match(/^border-(top|right|bottom|left)-color$/)?.[1];
      if (side && !(parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0)) return "";
      return style.getPropertyValue(prop);
    }).join("|");
  };
  const own = (el) => [read(el), read(el, "::before"), read(el, "::after")].join("#");
  const neighbours = (el) =>
    [el.parentElement, el.previousElementSibling, el.nextElementSibling, el.labels?.[0]]
      .filter(Boolean)
      .map((n) => own(n))
      .join("#");

  const baseline = new WeakMap();
  const FOCUSABLE =
    'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable="true"]';
  for (const el of document.querySelectorAll(FOCUSABLE)) {
    baseline.set(el, { own: own(el), neighbours: neighbours(el) });
  }

  const describe = (el) => {
    const name = (
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.getAttribute("placeholder") ||
      el.textContent ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50);
    const id = el.id ? `#${el.id}` : "";
    const classes = [...el.classList]
      .slice(0, 2)
      .map((c) => `.${c}`)
      .join("");
    return `${el.tagName.toLowerCase()}${id}${classes}${name ? ` "${name}"` : ""}`;
  };

  // A native date, time or month field has one more Tab stop than it shows: its own picker button,
  // inside the input's user-agent shadow tree. There the input is still `document.activeElement`
  // but matches neither `:focus` nor `:focus-visible`, and the ring on the button is drawn by the
  // browser, out of reach of the page's styles and of any reading taken from here. It is visible —
  // a thin ring around the calendar icon — so the stop is stepped over rather than judged.
  const NATIVE_PICKER =
    'input:is([type="date"], [type="time"], [type="datetime-local"], [type="month"], [type="week"])';

  let next = 1;
  window.__keyboardStop = () => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    if (!el.__keyboardKey) el.__keyboardKey = next++;
    if (el.matches(NATIVE_PICKER) && !el.matches(":focus")) {
      return { key: el.__keyboardKey, label: "", visible: true, indicated: true, iframe: false };
    }

    const rect = el.getBoundingClientRect();
    const visible =
      rect.width > 1 &&
      rect.height > 1 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth &&
      el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });

    const before = baseline.get(el);
    // An element drawn after the baseline was read has nothing to compare with, so it is not
    // judged rather than judged wrong.
    const ownChanged = before ? own(el) !== before.own : true;
    const neighbourChanged = before ? neighbours(el) !== before.neighbours : true;

    return {
      key: el.__keyboardKey,
      label: describe(el),
      visible,
      indicated: visible ? ownChanged || neighbourChanged : neighbourChanged,
      iframe: el.tagName === "IFRAME",
    };
  };
}

/**
 * Walks the page with Tab, from the top, as somebody arriving on it would.
 *
 * The walk ends when focus falls off the end of the document, which Chromium reports as the body, or
 * when it comes back round to the first stop.
 */
async function tabWalkProblems(page) {
  await page.evaluate(installReadings);
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });

  const missingIndicator = [];
  const invisible = [];
  let first = null;
  let finished = false;
  let stops = 0;
  const recent = [];

  for (let press = 0; press < MAX_STOPS; press++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => window.__keyboardStop());
    if (stop === null) {
      if (stops > 0) {
        finished = true;
        break;
      }
      continue;
    }
    // Inside an iframe the document's active element stays the frame. Nothing this app draws
    // has one that is loaded without a click, so it is noted and stepped over.
    if (stop.iframe) continue;
    if (first === null) first = stop.key;
    else if (stop.key === first) {
      finished = true;
      break;
    }
    stops += 1;
    recent.push(stop.label);
    if (recent.length > 5) recent.shift();

    if (!stop.visible && !stop.indicated) invisible.push(stop.label);
    else if (!stop.indicated) missingIndicator.push(stop.label);
  }

  const problems = [];
  if (missingIndicator.length > 0) {
    problems.push(
      problem(
        "keyboard-focus-not-visible",
        "A control takes keyboard focus and looks exactly the same as without it",
        missingIndicator
      )
    );
  }
  if (invisible.length > 0) {
    problems.push(
      problem(
        "keyboard-focus-on-nothing",
        "Keyboard focus lands on something that cannot be seen",
        invisible
      )
    );
  }
  if (!finished) {
    problems.push(
      problem(
        "keyboard-walk-incomplete",
        `Tab did not reach the end of the page in ${MAX_STOPS} presses — focus is caught somewhere`,
        recent
      )
    );
  }
  return problems;
}

/**
 * Runs in the page, with `this` bound to an element that has a click listener. Returns why the
 * keyboard cannot use it, or null when it can.
 */
function classifyClickable(keyHandled) {
  const el = this;
  if (!(el instanceof Element)) return null;
  if (el === document.documentElement || el === document.body) return null;
  if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;

  // The children of a composite widget — menu items, options, tabs, radios — are reached with the
  // arrow keys, not with Tab, and carry `tabindex="-1"` by design.
  const COMPOSITE =
    '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="tab"], [role="radio"], [role="treeitem"], [role="gridcell"]';
  if (el.closest(COMPOSITE)) return null;

  const NATIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, label';
  const describe = (node = el) => {
    const name = (node.getAttribute("aria-label") || node.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50);
    const classes = [...node.classList]
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join("");
    return `${node.tagName.toLowerCase()}${classes}${name ? ` "${name}"` : ""}`;
  };

  // A native control, or something inside one, is activated by the keyboard for free.
  if (el.closest(NATIVE)) return null;

  // The element itself, or the control it sits inside: `AdminListRow`'s actions column listens for
  // clicks only to stop them reaching the row, and the row is what the keyboard reaches.
  const focusable = el.closest('[tabindex]:not([tabindex="-1"])');
  if (focusable) {
    // A container that hands focus on to its children — reka-ui's tablist, a listbox, a menu —
    // is focusable only for as long as it takes to pass focus along. Its children carry the keys.
    const CONTAINER =
      '[role="tablist"], [role="listbox"], [role="menu"], [role="menubar"], [role="radiogroup"], [role="tree"], [role="treegrid"], [role="grid"], [role="toolbar"]';
    if (focusable.matches(CONTAINER)) return null;
    // Reachable, but a `role="button"` on a `div` or a `tr` does not get Enter and Space the way a
    // `<button>` does: something has to listen for them, here or on an ancestor.
    let node = focusable;
    while (node && node !== document.body) {
      if (keyHandled.has(node.__keyboardHandlerKey)) return null;
      node = node.parentElement;
    }
    return {
      target: describe(focusable),
      summary: "focusable, but nothing listens for Enter or Space on it",
    };
  }

  // Not reachable at all. Only reported when it also looks like a control: a `@click.stop` on a
  // wrapper listens for clicks without being one, and it has no pointer cursor.
  if (getComputedStyle(el).cursor !== "pointer") return null;
  return {
    target: describe(),
    summary: "looks clickable and has a click handler, but Tab never reaches it",
  };
}

/**
 * Every element that listens for a click, asked whether the keyboard can use it.
 *
 * The listeners come from the DevTools protocol, which is the only thing that can see them: Vue
 * attaches `@click` straight to the element, and nothing in the DOM records that it did. One call
 * lists the whole document's listeners, and only the elements that have one are looked at.
 */
async function clickablesTheKeyboardMisses(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { object: documentObject } = await cdp.send("DOM.resolveNode", {
      backendNodeId: root.backendNodeId,
    });
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", {
      objectId: documentObject.objectId,
      depth: -1,
      pierce: true,
    });

    // `click` only. `mousedown` and `pointerdown` are how widgets track where focus came from and
    // how sliders drag; neither makes an element a control, and `@click` is what Vue writes.
    const KEY = new Set(["keydown", "keyup", "keypress"]);
    const clickNodes = new Set();
    const keyNodes = new Set();
    for (const listener of listeners) {
      if (!listener.backendNodeId) continue;
      if (listener.type === "click") clickNodes.add(listener.backendNodeId);
      if (KEY.has(listener.type)) keyNodes.add(listener.backendNodeId);
    }

    // Marks the elements that listen for keys, so the classifier can ask about ancestors in-page.
    // Listeners on the document itself are global shortcuts and say nothing about one control.
    const keyHandled = [];
    for (const backendNodeId of keyNodes) {
      const { object } = await cdp.send("DOM.resolveNode", { backendNodeId });
      const { result } = await cdp.send("Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration: `function (key) {
          if (!(this instanceof Element) || this === document.documentElement || this === document.body) return null;
          this.__keyboardHandlerKey = key;
          return key;
        }`,
        arguments: [{ value: backendNodeId }],
        returnByValue: true,
      });
      if (result.value !== null && result.value !== undefined) keyHandled.push(result.value);
    }

    const found = [];
    for (const backendNodeId of clickNodes) {
      const { object } = await cdp.send("DOM.resolveNode", { backendNodeId });
      const { result } = await cdp.send("Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration: `function (keyHandled) {
          return (${classifyClickable.toString()}).call(this, new Set(keyHandled));
        }`,
        arguments: [{ value: keyHandled }],
        returnByValue: true,
      });
      if (result.value) found.push(result.value);
    }

    const unreachable = found.filter((f) => f.summary.startsWith("looks clickable"));
    const unhandled = found.filter((f) => f.summary.startsWith("focusable"));
    const problems = [];
    if (unreachable.length > 0) {
      problems.push(
        problem(
          "keyboard-unreachable-control",
          "Something that looks clickable, and is, cannot be reached with the keyboard",
          unreachable.map((f) => f.target)
        )
      );
    }
    if (unhandled.length > 0) {
      problems.push(
        problem(
          "keyboard-inert-control",
          "A control takes keyboard focus but does nothing on Enter or Space",
          unhandled.map((f) => f.target)
        )
      );
    }
    return problems;
  } finally {
    await cdp.detach().catch(() => {});
  }
}

function problem(id, help, targets) {
  const unique = [...new Set(targets)];
  return {
    id,
    impact: "serious",
    help,
    nodes: unique.slice(0, 5).map((target) => ({ target, summary: "" })),
    total: unique.length,
  };
}
