using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace NeoUI.Blazor.Primitives;

/// <summary>
/// The droppable container for a <see cref="SortablePrimitive{TItem}"/> sortable list.
/// Initialises the JavaScript drag sensor and receives the container element reference.
/// </summary>
/// <remarks>
/// Place this component directly inside <see cref="SortablePrimitive{TItem}"/>. All
/// <see cref="SortableItemPrimitive"/> children must be rendered inside this container.
/// </remarks>
public partial class SortableContentPrimitive : ComponentBase, IAsyncDisposable
{
    private ElementReference _containerRef;
    private IJSObjectReference? _jsModule;
    private bool _jsInitialized;
    private bool _disposed;

    /// <summary>Gets the cascading sortable context.</summary>
    [CascadingParameter]
    public SortableContext? Context { get; set; }

    /// <summary>Gets or sets the child content rendered inside the container.</summary>
    [Parameter]
    public RenderFragment? ChildContent { get; set; }

    /// <summary>Gets or sets additional HTML attributes applied to the container element.</summary>
    [Parameter(CaptureUnmatchedValues = true)]
    public Dictionary<string, object>? AdditionalAttributes { get; set; }

    /// <inheritdoc />
    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender && Context is not null && !_jsInitialized)
        {
            _jsInitialized = true;
            try
            {
                var jsModule = await JS.InvokeAsync<IJSObjectReference>(
                    "import", "./_content/NeoUI.Blazor.Primitives/js/primitives/sortable.js");

                // The component (or its cascading Context) may have been disposed while the dynamic
                // import was in flight — e.g. a fast tab switch tears the sortable down mid-init. Bail
                // before touching Context.DotNetRef, which is disposed on teardown and would throw
                // ObjectDisposedException when serialized for the JS "init" call.
                if (_disposed)
                {
                    await jsModule.DisposeAsync();
                    return;
                }

                _jsModule = jsModule;
                Context.JsModule = _jsModule;

                await _jsModule.InvokeVoidAsync(
                    "init",
                    _containerRef,
                    Context.DotNetRef,
                    Context.InstanceId,
                    Context.Orientation.ToString().ToLowerInvariant(),
                    Context.Group);
            }
            catch (ObjectDisposedException) { /* DotNetRef disposed between the guard and the JS call */ }
            catch (JSDisconnectedException) { /* circuit went away mid-init */ }
            catch (TaskCanceledException) { /* navigation/teardown cancelled the interop */ }
        }
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;

        if (_jsModule is not null && Context is not null)
        {
            try
            {
                await _jsModule.InvokeVoidAsync("dispose", Context.InstanceId);
            }
            catch (JSDisconnectedException) { }
            catch (TaskCanceledException) { }

            await _jsModule.DisposeAsync();
        }
    }
}
