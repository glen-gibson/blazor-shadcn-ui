namespace NeoUI.Blazor;

/// <summary>
/// Controls how the field picker is rendered in <see cref="FilterBuilder{TData}"/>.
/// </summary>
public enum FilterFieldPickerVariant
{
    /// <summary>
    /// Standard dropdown menu. Supports sub-menus for quick option value selection.
    /// Best when the field list is short (up to ~15 items).
    /// </summary>
    Dropdown,

    /// <summary>
    /// Searchable combobox backed by a Command palette.
    /// Recommended when the field list exceeds ~15 items.
    /// Note: sub-menu quick-select for option-backed fields is not available in this variant.
    /// </summary>
    Combobox
}
