using NeoUI.Blazor.Primitives;

namespace NeoUI.Blazor;

/// <summary>
/// Serializable snapshot of a <see cref="DataTable{TData}"/>'s user-adjustable view state.
/// Persisted (and restored) per <c>StateKey</c> so paging and sort survive navigation.
/// </summary>
public sealed record DataTableViewState
{
    /// <summary>Rows-per-page selection.</summary>
    public int PageSize { get; init; }

    /// <summary>Current page (1-based).</summary>
    public int CurrentPage { get; init; }

    /// <summary>Id of the sorted column, or null when unsorted.</summary>
    public string? SortedColumn { get; init; }

    /// <summary>Active sort direction.</summary>
    public SortDirection Direction { get; init; }
}
