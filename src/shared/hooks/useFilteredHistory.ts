import { useMemo } from "react";
import type { ClipboardEntry } from "../types";

interface UseFilteredHistoryOptions {
  history: ClipboardEntry[];
  search: string;
  typeFilter: string | null;
  tagFilter: string | null;
}

export const useFilteredHistory = ({
  history,
  search,
  typeFilter,
  tagFilter
}: UseFilteredHistoryOptions) => {
  return useMemo(() => {
    const lowerSearch = search.toLowerCase();

    const filtered = history.filter((item) => {
      // Type filter
      if (typeFilter && item.content_type !== typeFilter) return false;

      // Tag filter — proper category filter, not search
      if (tagFilter && !(item.tags || []).includes(tagFilter)) return false;

      // Search text
      const isTagSearch = lowerSearch.startsWith("tag:");
      const effectiveSearch = isTagSearch ? lowerSearch.slice(4) : lowerSearch;

      if (!effectiveSearch) return true;

      if (isTagSearch) {
        return item.tags?.some((tag) => tag.toLowerCase().includes(effectiveSearch)) ?? false;
      }

      return (
        item.content?.toLowerCase().includes(effectiveSearch) ||
        item.source_app?.toLowerCase().includes(effectiveSearch) ||
        item.tags?.some((tag) => tag.toLowerCase().includes(effectiveSearch))
      );
    });

    return filtered.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (a.is_pinned) {
        if ((a.pinned_order || 0) !== (b.pinned_order || 0))
          return (b.pinned_order || 0) - (a.pinned_order || 0);
        return b.timestamp - a.timestamp;
      }
      return b.timestamp - a.timestamp;
    });
  }, [history, search, typeFilter, tagFilter]);
};
