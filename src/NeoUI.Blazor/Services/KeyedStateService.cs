using Microsoft.JSInterop;

namespace NeoUI.Blazor.Services;

/// <summary>
/// Generic keyed state persistence service. Stores arbitrary string values (typically JSON) via a
/// JavaScript module that writes both localStorage and cookies. The cookie copy lets components read
/// saved state server-side during SSR pre-rendering (via <c>IHttpContextAccessor</c>) before falling
/// back to these client-side methods. This is the string/JSON counterpart to
/// <see cref="CollapsibleStateService"/> (which is boolean-only) and uses the <c>neoui:state:</c> prefix.
/// </summary>
public class KeyedStateService : IAsyncDisposable
{
    private readonly IJSRuntime _jsRuntime;
    private const string StoragePrefix = "neoui:state:";

    // In-memory mirror of the last value read/written this scope (per circuit in Server, per app in
    // WASM). Lets components restore synchronously — before first render — on a remount within the
    // same session, avoiding the flicker of an async localStorage read after the first paint.
    private readonly Dictionary<string, string> _cache = new();

    /// <summary>
    /// Gets the storage key prefix used for keyed state storage. Used by components that read the
    /// cookie fallback server-side.
    /// </summary>
    public static string KeyPrefix => StoragePrefix;

    /// <summary>
    /// Synchronously reads the value cached in memory for this scope (populated by prior
    /// Get/Set calls). Returns false when nothing has been read or written for the key yet.
    /// Use this to restore state before the first render (no JS interop, no flicker).
    /// </summary>
    public bool TryGetCached(string key, out string? value) => _cache.TryGetValue(key, out value);

    private IJSObjectReference? _module;

    /// <summary>
    /// Initializes a new instance of the <see cref="KeyedStateService"/> class.
    /// </summary>
    /// <param name="jsRuntime">The JavaScript runtime for interop operations.</param>
    public KeyedStateService(IJSRuntime jsRuntime)
    {
        _jsRuntime = jsRuntime;
    }

    private async Task<IJSObjectReference> EnsureModuleAsync()
    {
        _module ??= await _jsRuntime.InvokeAsync<IJSObjectReference>(
            "import", "./_content/NeoUI.Blazor/js/keyed-state.js");
        return _module;
    }

    /// <summary>
    /// Gets the saved value for a key from client-side storage (localStorage, then cookie).
    /// Only available during client-side rendering (uses JS interop).
    /// </summary>
    /// <param name="key">Unique identifier for the state (without prefix).</param>
    /// <returns>The saved string value, or <c>null</c> if none is stored.</returns>
    public async Task<string?> GetStateAsync(string key)
    {
        try
        {
            var module = await EnsureModuleAsync();
            var value = await module.InvokeAsync<string?>("getState", key);
            if (value is not null)
                _cache[key] = value;
            return value;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Saves a value for a key. Writes to both localStorage (client persistence) and a cookie (SSR).
    /// </summary>
    /// <param name="key">Unique identifier for the state (without prefix).</param>
    /// <param name="value">The value to store (typically JSON).</param>
    public async Task SetStateAsync(string key, string value)
    {
        _cache[key] = value;   // keep the sync cache current even if the JS write is delayed
        try
        {
            var module = await EnsureModuleAsync();
            await module.InvokeVoidAsync("setState", key, value);
        }
        catch
        {
            // Silently fail — persistence is best-effort.
        }
    }

    /// <summary>
    /// Clears the saved value for a key from both localStorage and cookie.
    /// </summary>
    /// <param name="key">Unique identifier for the state (without prefix).</param>
    public async Task ClearStateAsync(string key)
    {
        _cache.Remove(key);
        try
        {
            var module = await EnsureModuleAsync();
            await module.InvokeVoidAsync("clearState", key);
        }
        catch
        {
            // Silently fail.
        }
    }

    /// <summary>
    /// Disposes the service and its JavaScript module.
    /// </summary>
    public async ValueTask DisposeAsync()
    {
        if (_module != null)
        {
            try
            {
                await _module.DisposeAsync();
            }
            catch (JSDisconnectedException)
            {
                // Circuit disconnected, ignore.
            }
        }

        GC.SuppressFinalize(this);
    }
}
