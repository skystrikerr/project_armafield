/**
 * Gamepad navigation for the DOM menus.
 *
 * The in-game controller support drives the simulation directly, but every
 * screen outside the match — setup, briefing, deploy, pause, results — is
 * React DOM the pad cannot touch. Since the setup screen is now a mandatory
 * gate before a match, that left a controller unable to get from launch into
 * a game at all.
 *
 * Rather than teach each screen about gamepads, this drives whatever is on
 * screen: it finds the focusable controls, moves between them spatially with
 * the stick or d-pad, and clicks with A. One driver covers every overlay, and
 * any overlay added later works without changes.
 */

const FOCUSABLE =
  'button:not([disabled]):not([aria-hidden="true"]), input[type="range"]:not([disabled])';

/** Repeat behaviour for a held direction, so a nudge moves one item. */
const FIRST_REPEAT = 0.42;
const NEXT_REPEAT = 0.12;
const DEAD = 0.5;

type Dir = "up" | "down" | "left" | "right";

let styleInjected = false;

function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const el = document.createElement("style");
  // A ring the pad can be steered by. Deliberately loud: on a television at
  // three metres a subtle outline is not findable.
  el.textContent = `
    .gp-focus {
      outline: 2px solid #ffd479 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 4px rgba(255, 212, 121, 0.18) !important;
    }
  `;
  document.head.appendChild(el);
}

/**
 * Deliberately does not reject controls outside the viewport. The setup screen
 * scrolls, and filtering to what is currently on screen would make everything
 * below the fold permanently unreachable — focusing an off-screen control
 * scrolls it into view instead.
 */
function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
}

function candidates(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
}

/**
 * The nearest control in a direction. Distance along the travel axis dominates,
 * with the perpendicular offset as a strong tiebreak, so moving right along a
 * row of chips does not jump to a different section that happens to be closer
 * in a straight line.
 */
function nearest(from: HTMLElement, dir: Dir, all: HTMLElement[]): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    let along: number;
    let across: number;
    if (dir === "left" || dir === "right") {
      along = dir === "right" ? dx : -dx;
      across = Math.abs(dy);
    } else {
      along = dir === "down" ? dy : -dy;
      across = Math.abs(dx);
    }
    // Must actually lie in the direction travelled.
    if (along < 6) continue;
    const score = along + across * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function setFocus(el: HTMLElement | null, previous: HTMLElement | null) {
  if (previous) previous.classList.remove("gp-focus");
  if (!el) return;
  el.classList.add("gp-focus");
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

function nudgeSlider(el: HTMLInputElement, delta: number) {
  const step = Number(el.step) || 1;
  const min = Number(el.min) || 0;
  const max = Number(el.max) || 100;
  const next = Math.min(max, Math.max(min, Number(el.value) + step * delta));
  if (next === Number(el.value)) return;
  // React listens for input/change, so both are dispatched the way a real
  // drag would produce them.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, String(next));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Starts driving the menus from gamepad 0. `isActive` is polled each frame so
 * the caller can switch it off the moment a match is being played, leaving the
 * pad to the game.
 */
export function startGamepadMenuNav(isActive: () => boolean): () => void {
  injectStyle();
  let raf = 0;
  let last = performance.now();
  let focused: HTMLElement | null = null;
  let repeat = 0;
  let heldDir: Dir | null = null;
  const prevButtons: boolean[] = [];
  let wasActive = false;

  const clearFocus = () => {
    if (focused) focused.classList.remove("gp-focus");
    focused = null;
    heldDir = null;
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (!isActive()) {
      if (wasActive) clearFocus();
      wasActive = false;
      return;
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[0];
    if (!gp) {
      if (wasActive) clearFocus();
      wasActive = false;
      return;
    }
    // Entering a menu with a pad already connected: take focus immediately so
    // there is always something highlighted to act on.
    const all = candidates();
    if (all.length === 0) return;
    if (!wasActive || !focused || !focused.isConnected || !all.includes(focused)) {
      setFocus(all[0], focused);
      focused = all[0];
    }
    wasActive = true;

    const held = (i: number) => gp.buttons[i]?.pressed ?? false;
    const edge = (i: number) => {
      const down = held(i);
      const was = prevButtons[i] ?? false;
      prevButtons[i] = down;
      return down && !was;
    };

    // Direction from the d-pad or the left stick, whichever is deflected.
    const lx = gp.axes[0] ?? 0;
    const ly = gp.axes[1] ?? 0;
    let dir: Dir | null = null;
    if (held(12) || ly < -DEAD) dir = "up";
    else if (held(13) || ly > DEAD) dir = "down";
    else if (held(14) || lx < -DEAD) dir = "left";
    else if (held(15) || lx > DEAD) dir = "right";

    if (dir !== heldDir) {
      heldDir = dir;
      repeat = 0;
    }
    if (dir) {
      repeat -= dt;
      if (repeat <= 0) {
        repeat = repeat === 0 ? FIRST_REPEAT : NEXT_REPEAT;
        const slider = focused instanceof HTMLInputElement && focused.type === "range" ? focused : null;
        if (slider && (dir === "left" || dir === "right")) {
          // Left and right adjust a focused slider rather than leaving it.
          nudgeSlider(slider, dir === "right" ? 1 : -1);
        } else {
          // Spatial first, then document order as a guarantee. Purely spatial
          // navigation can dead-end — a control at the bottom of a column with
          // nothing scoring below it leaves the pad stuck with no way out, and
          // on a controller that is unrecoverable without reaching for a mouse.
          let next = nearest(focused!, dir, all);
          if (!next) {
            const i = all.indexOf(focused!);
            const step = dir === "down" || dir === "right" ? 1 : -1;
            next = all[Math.min(all.length - 1, Math.max(0, i + step))] ?? null;
          }
          if (next && next !== focused) {
            setFocus(next, focused);
            focused = next;
          }
        }
      }
    } else {
      repeat = 0;
    }

    // A confirms. B steps back, which on these screens means whichever control
    // resumes or closes — there is never more than one.
    if (edge(0) && focused) focused.click();
    if (edge(1)) {
      const back = all.find((el) => /^(resume|close|back)\b/i.test(el.innerText.trim()));
      if (back) back.click();
    }
  };

  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    clearFocus();
  };
}
