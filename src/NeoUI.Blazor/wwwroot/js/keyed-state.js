/**
 * Generic keyed state management module.
 * Persists arbitrary string values (typically JSON) in both localStorage and cookies,
 * so state survives navigation and can be read server-side during SSR pre-rendering.
 * Mirrors collapsible-state.js but stores raw strings instead of booleans.
 */

const STORAGE_PREFIX = "neoui:state:";
const COOKIE_EXPIRATION_DAYS = 365;

/**
 * Get a saved value from localStorage (with cookie fallback).
 * @param {string} key - The state key (without prefix)
 * @returns {string|null} The saved value, or null if not found
 */
export function getState(key) {
    const storageKey = STORAGE_PREFIX + key;

    // Try localStorage first
    const localValue = localStorage.getItem(storageKey);
    if (localValue !== null) {
        return localValue;
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

    localStorage.setItem(storageKey, value);
    setCookie(storageKey, value, COOKIE_EXPIRATION_DAYS);
}

/**
 * Clear a saved value from both localStorage and cookie.
 * @param {string} key - The state key (without prefix)
 */
export function clearState(key) {
    const storageKey = STORAGE_PREFIX + key;

    localStorage.removeItem(storageKey);
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

    document.cookie = encodedName + "=" + encodedValue + expires + "; path=/; SameSite=Lax" + secure;
}

/**
 * Delete cookie.
 * @param {string} name - Cookie name
 */
function deleteCookie(name) {
    setCookie(name, "", -1);
}
