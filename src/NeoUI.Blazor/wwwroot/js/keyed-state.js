/**
 * Generic keyed state management module.
 * Persists arbitrary string values (typically JSON) in both localStorage and cookies,
 * so state survives navigation and can be read server-side during SSR pre-rendering.
 * Mirrors collapsible-state.js but stores raw strings instead of booleans.
 */

const STORAGE_PREFIX = "neoui:state:";
const COOKIE_EXPIRATION_DAYS = 365;
// Stay well under the ~4KB per-cookie limit (leaving room for the name and attributes). Larger
// values would be truncated by the browser — breaking the JSON — so we skip the cookie mirror for
// them and rely on localStorage (only SSR pre-render restore is forgone in that case).
const MAX_COOKIE_BYTES = 3800;

/**
 * Get a saved value from localStorage (with cookie fallback).
 * @param {string} key - The state key (without prefix)
 * @returns {string|null} The saved value, or null if not found
 */
export function getState(key) {
    const storageKey = STORAGE_PREFIX + key;

    // localStorage can throw in privacy / blocked-storage modes — fall back to the cookie.
    try {
        const localValue = localStorage.getItem(storageKey);
        if (localValue !== null) {
            return localValue;
        }
    } catch {
        // fall through to the cookie
    }

    // Fallback to cookie (readable server-side during pre-render)
    return getCookie(storageKey);
}

/**
 * Save a value to both localStorage and a cookie.
 * @param {string} key - The state key (without prefix)
 * @param {string} value - The value to store (typically JSON)
 */
export function setState(key, value) {
    const storageKey = STORAGE_PREFIX + key;

    // Best-effort: a localStorage write can throw (quota exceeded / blocked storage); still mirror
    // to the cookie so persistence keeps working.
    try {
        localStorage.setItem(storageKey, value);
    } catch {
        // ignore — the cookie mirror below is the fallback
    }
    setCookie(storageKey, value, COOKIE_EXPIRATION_DAYS);
}

/**
 * Clear a saved value from both localStorage and cookie.
 * @param {string} key - The state key (without prefix)
 */
export function clearState(key) {
    const storageKey = STORAGE_PREFIX + key;

    try {
        localStorage.removeItem(storageKey);
    } catch {
        // best-effort
    }
    deleteCookie(storageKey);
}

/**
 * Get cookie value.
 * @param {string} name - Cookie name
 * @returns {string|null} Cookie value or null
 */
function getCookie(name) {
    // URL-encode the name to match how it was set
    const encodedName = encodeURIComponent(name);
    const nameEQ = encodedName + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) {
            // URL-decode the value when returning
            return decodeURIComponent(c.substring(nameEQ.length, c.length));
        }
    }
    return null;
}

/**
 * Set cookie value.
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {number} days - Expiration in days
 */
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }

    // Add Secure flag for HTTPS so the cookie is sent to the server during pre-rendering
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';

    // URL-encode the name and value to handle special characters like colons
    const encodedName = encodeURIComponent(name);
    const encodedValue = encodeURIComponent(value || "");

    // Cookies are size-limited (~4KB) and sent on every request. Skip mirroring oversized values —
    // the browser would truncate them (corrupting the JSON) — and drop any prior cookie so SSR never
    // reads a stale/partial value. localStorage still holds the full value.
    if (encodedName.length + encodedValue.length > MAX_COOKIE_BYTES) {
        deleteCookie(name);
        return;
    }

    document.cookie = encodedName + "=" + encodedValue + expires + "; path=/; SameSite=Lax" + secure;
}

/**
 * Delete cookie.
 * @param {string} name - Cookie name
 */
function deleteCookie(name) {
    setCookie(name, "", -1);
}
