/**
 * SelectionIndicator interop module.
 * Positions an absolutely-placed indicator element over the active child in a container
 * and animates it with CSS transitions when selection changes.
 *
 * Works with any container that marks its active child via:
 *   data-state="active"    (Tabs, RadioGroup, Select, DropdownMenuRadioItem)
 *   aria-checked="true"    (ToggleGroup single mode)
 *   data-state="checked"   (RadioGroup, Select, DropdownMenuRadioItem)
 *   aria-current="page"    (Pagination)
 *   data-active="true"     (NavigationMenuLink)
 *
 * CSS custom properties (set on the indicator element):
 *   --si-duration   transition duration in ms         (default: 260)
 *   --si-easing     CSS easing function                (default: cubic-bezier(0.34, 1.56, 0.64, 1))
 *   --si-height     fixed height override in any unit  (when set, indicator is pinned to the bottom
 *                   of the active/hovered element — useful for underline variants)
 */

/** @type {WeakMap<Element, { observer: MutationObserver, cleanup: () => void }>} */
const instanceMap = new WeakMap();

/**
 * Parses a CSS time value ("260ms", "0.26s", "260") to milliseconds.
 * @param {string} value
 * @returns {number}
 */
function parseDurationMs(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return 0;
    // "s" suffix but NOT "ms" suffix → seconds
    const trimmed = value.trim();
    return (trimmed.endsWith('s') && !trimmed.endsWith('ms')) ? num * 1000 : num;
}

/**
 * Position of el's offset box relative to container, summed up the offsetParent chain.
 * Uses offsetLeft/offsetTop (the layout box), so it is invariant to ancestor CSS transforms
 * and to scroll position — unlike getBoundingClientRect. container is set position:relative by
 * init(), so it is always a positioned ancestor and therefore part of the offsetParent chain.
 * @param {HTMLElement} el
 * @param {HTMLElement} container
 * @returns {{left: number, top: number}}
 */
function offsetWithin(el, container) {
    let left = 0, top = 0, node = el;
    while (node && node !== container) {
        left += node.offsetLeft;
        top  += node.offsetTop;
        const parent = node.offsetParent;
        if (!parent || parent === container) break;
        node = parent;
    }
    return { left, top };
}

/**
 * Measures an element and updates the indicator's inline position.
 * @param {HTMLElement} indicator
 * @param {HTMLElement} container
 * @param {HTMLElement} activeEl   - already-resolved active/hovered element
 * @param {boolean}     instant    - Skip animation (used on first render)
 * @param {string}      transition - Pre-built CSS transition string
 * @param {string|null} fixedHeight - Value of --si-height (e.g. "2px"), or empty string
 */
function applyPosition(indicator, container, activeEl, instant, transition, fixedHeight) {
    // Measure with the offset box (offsetLeft/Top/Width/Height), NOT getBoundingClientRect.
    //
    // ROOT CAUSE of the floating-portal-only bug: portal content (Select, DropdownMenu, …) mounts
    // with an entry animation that scale-transforms a wrapper ABOVE this container (e.g.
    // `animate-in zoom-in-95`). getBoundingClientRect() reports the post-transform (scaled-down)
    // box, so a pill measured mid-animation locks in a too-small px size — and because the pill is
    // itself a child of that scaling wrapper, it never self-corrects once the scale settles to 1.
    // Non-portal containers (Tabs, sidebar, pagination) have no entry transform, which is why only
    // portals were affected. The offset box is the *layout* box — unaffected by ancestor transforms
    // and by scroll position — so we get the true, final geometry immediately, even on frame one of
    // the zoom. The pill then scales in naturally with the content and lands exactly right.
    // Horizontal axis: when siAutoX is set (a Select dropdown — see init), we let CSS own left+width
    // entirely. Every Select item is full-width and shares the inner container whose padding equals
    // the inset, so "container minus the inset" already equals the item width — the pill is correctly
    // sized from the first paint and auto-tracks the container, so the async trigger-matched width
    // can never produce a wrong measure (no race, nothing to re-measure). We then only drive the
    // vertical axis (top/height) in JS, which is intrinsic and available immediately. Everything else
    // (Tabs, nav underline, DropdownMenu) measures and sets left/width as before.
    const autoX = 'siAutoX' in indicator.dataset;
    const { left: offLeft, top: offTop } = offsetWithin(activeEl, container);

    let top, height;
    if (fixedHeight) {
        // Pin to the bottom of the active element at a fixed height.
        // Measure the height in px via layout (offsetHeight — supports any CSS unit: px, rem, em…)
        const prevHeight = indicator.style.height;
        indicator.style.height = fixedHeight;
        const pixelHeight = indicator.offsetHeight || parseFloat(fixedHeight) || 0;
        indicator.style.height = prevHeight;
        height = fixedHeight;
        top    = `${offTop + activeEl.offsetHeight - pixelHeight}px`;
    } else {
        top    = `${offTop}px`;
        height = `${activeEl.offsetHeight}px`;
    }

    const styles = { top, height, opacity: '1' };
    if (!autoX) {
        styles.left  = `${offLeft}px`;
        styles.width = `${activeEl.offsetWidth}px`;
    }

    if (instant) {
        indicator.style.transition = 'none';
        Object.assign(indicator.style, styles);
        requestAnimationFrame(() => { if (indicator.isConnected) indicator.style.transition = transition; });
    } else {
        Object.assign(indicator.style, styles);
    }
}

/**
 * Returns false if any ancestor of el (up to but not including container)
 * has data-state="closed", meaning the element is inside a collapsed section.
 * @param {HTMLElement} el
 * @param {HTMLElement} container
 * @returns {boolean}
 */
function isAncestorOpen(el, container) {
    let node = el.parentElement;
    while (node && node !== container) {
        if (node.dataset.state === 'closed') return false;
        node = node.parentElement;
    }
    return true;
}

/**
 * Resolves the active element and repositions the indicator, or hides it.
 * Uses the selector (the selected/checked item) — this is the "rest" position the indicator
 * returns to when nothing is hovered/keyboard-highlighted. Hover and keyboard highlights are
 * tracked separately (see init) so that clearing them doesn't snap back here.
 */
function positionIndicator(indicator, container, selector, instant, transition, fixedHeight) {
    const activeEl = container.querySelector(selector);
    if (!activeEl || !isAncestorOpen(activeEl, container)) {
        indicator.style.opacity = '0';
        return;
    }
    applyPosition(indicator, container, activeEl, instant, transition, fixedHeight);
}

/**
 * Initialises the indicator: positions it immediately, then sets up a
 * MutationObserver to re-position whenever a relevant attribute changes.
 *
 * @param {HTMLElement} indicator   - The indicator div rendered by SelectionIndicator.razor
 * @param {string}  selector        - CSS selector for the active item
 * @param {boolean} hoverEnabled    - When true, the indicator also follows mouse hover and keyboard focus
 * @param {string|null} hoverTarget - Optional CSS selector used to resolve the hover target.
 *                                    When set, uses e.target.closest(hoverTarget) instead of
 *                                    walking up to the direct child of the container.
 *                                    Useful for nested menus where items exist at varying depths.
 */
export function init(indicator, selector, hoverEnabled, hoverTarget) {
    if (!indicator) return;
    // Idempotency: if this element was already initialised (defensive — a re-render or a
    // re-used DOM node), tear down the previous observers/listeners before wiring new ones so
    // they can't accumulate. dispose() is hoisted, so calling it here before its definition is fine.
    if (instanceMap.has(indicator)) dispose(indicator);
    const container = indicator.parentElement;
    if (!container) return;

    // Ensure the container creates a positioning context for the absolute indicator
    const pos = window.getComputedStyle(container).position;
    if (pos === 'static') container.style.position = 'relative';

    // Read animation config from CSS custom properties (defaults set on the component element)
    const cs        = getComputedStyle(indicator);
    const durRaw    = cs.getPropertyValue('--si-duration').trim();  // e.g. "260ms" or "0.26s"
    const duration  = parseDurationMs(durRaw) || 260;
    const easing    = cs.getPropertyValue('--si-easing').trim()     || 'cubic-bezier(0.34,1.56,0.64,1)';
    const fixedHeight = cs.getPropertyValue('--si-height').trim();  // px only, e.g. "2px"

    // Let CSS own the pill's width — Select dropdowns ONLY (see applyPosition / siAutoX). A Select's
    // content matches the trigger width asynchronously (the race this solves), and its items and the
    // indicator share the same inner container whose padding equals the inset, so "container minus
    // inset-x" is exactly the item width — correct from the first paint, immune to the race, no
    // measurement. Gate it to Select specifically ([data-select-content] ancestor): other vertical
    // menus (DropdownMenu radio) have no such race and their indicator sits in a paddingless group
    // that doesn't share the items' exact box, so CSS sizing would offset/gap — JS measurement is
    // perfect there and is kept. Also require the pill's own CSS to actually size it (inset-x-*).
    // Clear any leftover inline left/width first so we read the CSS-intended value, not a prior run's.
    indicator.style.width = '';
    indicator.style.left  = '';
    const isSelectContent = !!container.closest('[data-select-content]');
    if (isSelectContent && parseFloat(cs.width) > 2) indicator.dataset.siAutoX = '';
    else delete indicator.dataset.siAutoX;

    const transition = [
        `left ${duration}ms ${easing}`,
        `top ${duration}ms ${easing}`,
        `width ${duration}ms ${easing}`,
        `height ${duration}ms ${easing}`,
        `opacity ${Math.round(duration * 0.58)}ms ease`,
    ].join(', ');

    // Snap to correct position immediately (no animation on first render)
    positionIndicator(indicator, container, selector, true, transition, fixedHeight);

    // If there was no initial active element, applyPosition(instant: true) was never called,
    // so indicator.style.transition was never initialized. Ensure it's set now so that
    // the first hover or selection change animates correctly instead of jumping instantly.
    if (!indicator.style.transition) {
        requestAnimationFrame(() => { if (indicator.isConnected) indicator.style.transition = transition; });
    }

    // Watch for attribute changes that signal a new active item.
    // Guarded by siHover: while the pointer/keyboard is actively driving the indicator, incidental
    // attribute mutations (e.g. a DropdownMenu moving real DOM focus between items as you hover,
    // which toggles data-state/aria-* on options) must NOT yank the pill back to the selected item
    // — that was the hover flicker. Snap-back to the selected item is owned solely by
    // mouseleave/focusout. When not hovering, this tracks genuine selection changes as before.
    const observer = new MutationObserver(() => {
        if ('siHover' in indicator.dataset) return;
        positionIndicator(indicator, container, selector, false, transition, fixedHeight);
    });

    observer.observe(container, {
        subtree: true,
        attributeFilter: ['data-state', 'aria-selected', 'aria-checked', 'aria-current', 'data-active'],
    });

    // ── Hover tracking ──────────────────────────────────────────────────────
    const hoverHandlers = [];
    if (hoverEnabled) {
        // The item the pointer is currently over (null when the pointer is away). Used to let the
        // mouse win over a stale keyboard highlight — see onFocusedChange.
        let pointerEl = null;

        const onMouseOver = (e) => {
            let el;
            if (hoverTarget) {
                // Find the closest ancestor (or self) matching hoverTarget within the container
                el = e.target.closest(hoverTarget);
                if (!el || el === container || !container.contains(el)) return;
            } else {
                // Default: walk up from event target to find a direct child of the container
                el = e.target;
                while (el && el.parentElement !== container) el = el.parentElement;
            }
            if (!el || el === indicator) return;
            pointerEl = el;
            indicator.dataset.siHover = '';
            // Snap on first hover if indicator has no position yet (no active selector match),
            // otherwise animate. Mirrors the behaviour of containers with an initial active item.
            const snap = indicator.style.opacity !== '1';
            applyPosition(indicator, container, el, snap, transition, fixedHeight);
        };

        const snapBack = () => {
            pointerEl = null;
            delete indicator.dataset.siHover;
            positionIndicator(indicator, container, selector, false, transition, fixedHeight);
        };

        const onMouseLeave = snapBack;

        // ── Keyboard focus tracking (shares same highlight state as hover) ──────
        const onFocusIn = (e) => {
            let el;
            if (hoverTarget) {
                el = e.target.closest(hoverTarget);
                if (!el || el === container || !container.contains(el)) return;
            } else {
                el = e.target;
                while (el && el.parentElement !== container) el = el.parentElement;
            }
            if (!el || el === indicator) return;
            indicator.dataset.siHover = '';
            const snap = indicator.style.opacity !== '1';
            applyPosition(indicator, container, el, snap, transition, fixedHeight);
        };

        const onFocusOut = (e) => {
            // Only snap back when focus leaves the container entirely
            if (container.contains(e.relatedTarget)) return;
            snapBack();
        };

        // Keyboard activity hands control back to the keyboard: clear pointer ownership so the next
        // data-focused change (arrow-key nav) is honoured even if the mouse is still resting over an
        // item. Together with onMouseOver re-claiming it, this is plain last-input-wins arbitration.
        const onKeyDown = () => { pointerEl = null; };

        container.addEventListener('mouseover', onMouseOver);
        container.addEventListener('mouseleave', onMouseLeave);
        container.addEventListener('focusin', onFocusIn);
        container.addEventListener('focusout', onFocusOut);
        container.addEventListener('keydown', onKeyDown);
        hoverHandlers.push(
            () => container.removeEventListener('mouseover', onMouseOver),
            () => container.removeEventListener('mouseleave', onMouseLeave),
            () => container.removeEventListener('focusin', onFocusIn),
            () => container.removeEventListener('focusout', onFocusOut),
            () => container.removeEventListener('keydown', onKeyDown),
        );

        // ── Keyboard navigation (aria-activedescendant) ─────────────────────────
        // Select-style menus mark the active option with data-focused="true" but never move
        // real DOM focus, so focusin never fires. Mirror that highlight onto the indicator,
        // treating it exactly like a hover. Deliberately do NOTHING when it clears: a pointer
        // momentarily crossing the gap between options unsets it, and the pill should stay put
        // instead of flicking back to the selected item. Snap-back to the selected item is owned
        // solely by mouseleave/focusout (which reposition via the selector).
        //
        // Mouse wins over a stale keyboard highlight: select.js drives data-focused purely from
        // the keyboard index and never updates it on mouse-over, so while you hover, data-focused
        // stays pinned to the originally-focused option. Any Blazor re-render that re-asserts that
        // attribute fires this observer and would yank the pill back to it — the first-hover
        // flicker. So when the pointer is currently over a DIFFERENT option (pointerEl set and not
        // equal to the focused one), ignore the change and let the pointer keep the pill. With the
        // pointer away (pure keyboard nav), pointerEl is null and this drives normally.
        const onFocusedChange = () => {
            const el = container.querySelector('[data-focused="true"]');
            if (!el || el === indicator || !isAncestorOpen(el, container)) return;
            if (pointerEl && el !== pointerEl) return;
            indicator.dataset.siHover = '';
            const snap = indicator.style.opacity !== '1';
            applyPosition(indicator, container, el, snap, transition, fixedHeight);
        };
        const focusedObserver = new MutationObserver(onFocusedChange);
        focusedObserver.observe(container, { subtree: true, attributeFilter: ['data-focused'] });
        hoverHandlers.push(() => focusedObserver.disconnect());
    }

    // ── Layout-shift tracking (collapsible expand/collapse) ─────────────────
    // When a SidebarCollapsibleGroup expands or collapses, its grid-template-rows
    // transition shifts items below it before the MutationObserver fires. Re-position
    // after any layout-affecting transition ends so the indicator lands correctly.
    const layoutProps = new Set(['grid-template-rows', 'height', 'max-height']);
    const onLayoutTransitionEnd = (e) => {
        if (e.target === indicator) return;           // ignore the indicator's own transitions
        if (!layoutProps.has(e.propertyName)) return; // ignore colour / opacity / etc.
        if ('siHover' in indicator.dataset) return;   // don't disturb an active hover highlight
        positionIndicator(indicator, container, selector, false, transition, fixedHeight);
    };
    container.addEventListener('transitionend', onLayoutTransitionEnd);
    container.addEventListener('transitioncancel', onLayoutTransitionEnd);

    // ── Sidebar expand/collapse tracking ────────────────────────────────────
    // The sidebar width transition runs on the <aside> parent — transitionend
    // doesn't propagate down into SidebarContent, so we use ResizeObserver to
    // detect when the container (or its sidebar ancestor) changes size and
    // reposition the indicator accordingly.
    let resizeRafId = null;
    const resizeObserver = new ResizeObserver(() => {
        if (resizeRafId) return;
        resizeRafId = requestAnimationFrame(() => {
            resizeRafId = null;
            if (!container.isConnected || !indicator.isConnected) return;
            if ('siHover' in indicator.dataset) return;
            positionIndicator(indicator, container, selector, false, transition, fixedHeight);
        });
    });
    resizeObserver.observe(container);
    // Also observe the nearest sidebar <aside> in case SidebarContent itself
    // doesn't resize (e.g. transform-based collapse, or nested scroll viewports).
    const sidebarAside = container.closest('aside[data-sidebar="sidebar"]');
    if (sidebarAside) resizeObserver.observe(sidebarAside);
    // Also observe direct children: a child item resizing (e.g. a tab's count badge
    // appearing/disappearing changes that item's width without changing the container's
    // own border-box) must still reposition/resize the indicator over the active item.
    for (const child of container.children) {
        if (child !== indicator) resizeObserver.observe(child);
    }

    instanceMap.set(indicator, {
        observer,
        cleanup: () => {
            resizeObserver.disconnect();
            if (resizeRafId) { cancelAnimationFrame(resizeRafId); resizeRafId = null; }
            hoverHandlers.forEach(fn => fn());
            container.removeEventListener('transitionend', onLayoutTransitionEnd);
            container.removeEventListener('transitioncancel', onLayoutTransitionEnd);
        },
    });
}

/**
 * Disconnects the MutationObserver and removes hover listeners for the given indicator.
 * Called from SelectionIndicator.razor's DisposeAsync.
 *
 * @param {HTMLElement} indicator
 */
export function dispose(indicator) {
    const instance = instanceMap.get(indicator);
    if (!instance) return;
    instance.observer.disconnect();
    instance.cleanup();
    instanceMap.delete(indicator);
}
