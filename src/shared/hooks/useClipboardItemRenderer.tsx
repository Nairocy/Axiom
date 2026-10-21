import { useCallback } from "react";

const EMPTY_TAG_SUGGESTIONS: string[] = [];
import type { Dispatch, SetStateAction, MouseEvent, ReactNode } from "react";
import type { DragControls } from "framer-motion";
import ClipboardItem from "../../features/clipboard/components/ClipboardItem";
import type { QuickPasteHint } from "../../features/clipboard/types";
import type { ClipboardEntry } from "../types";
import type { Locale } from "../types";

interface UseClipboardItemRendererOptions {
  revealedIds: Set<number>;
  isKeyboardMode: boolean;
  selectedIndex: number;
  isWindowPinned: boolean;
  editingTagsId: number | null;
  allTags: string[];
  tagColors: Record<string, string>;
  theme: string;
  language: Locale;
  t: (key: string) => string;
  showSourceAppIcon: boolean;
  compactMode: boolean;
  quickPasteHintsById: Record<number, QuickPasteHint>;
  aiOptionsOpenId: number | null;
  setAiOptionsOpenId: Dispatch<SetStateAction<number | null>>;
  copyToClipboard: (
    id: number,
    content: string,
    contentType: string,
    pasteWithFormat?: boolean,
    isPinned?: boolean,
    tags?: string[]
  ) => Promise<void>;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  setRevealedIds: Dispatch<SetStateAction<Set<number>>>;
  openContent: (item: ClipboardEntry) => void;
  togglePin: (event: MouseEvent, id: number, isPinned: boolean) => void;
  deleteEntry: (event: MouseEvent, id: number) => void;
  setEditingTagsId: Dispatch<SetStateAction<number | null>>;
  handleUpdateTags: (id: number, tags: string[]) => void;
}

type RenderItemContent = (
  item: ClipboardEntry,
  index: number,
  dragControls?: DragControls,
  disableLayout?: boolean
) => ReactNode;

export const useClipboardItemRenderer = ({
  revealedIds,
  isKeyboardMode,
  selectedIndex,
  isWindowPinned,
  editingTagsId,
  allTags,
  tagColors,
  theme,
  language,
  t,
  showSourceAppIcon,
  compactMode,
  quickPasteHintsById,
  aiOptionsOpenId,
  setAiOptionsOpenId,
  copyToClipboard,
  setSelectedIndex,
  setRevealedIds,
  openContent,
  togglePin,
  deleteEntry,
  setEditingTagsId,
  handleUpdateTags
}: UseClipboardItemRendererOptions): { renderItemContent: RenderItemContent } => {
  const renderItemContent = useCallback(
    (item: ClipboardEntry, index: number, dragControls?: DragControls, disableLayout?: boolean) => {
      const isEditingTags = editingTagsId === item.id;

      return (
        <ClipboardItem
          id={`clipboard-item-${item.id}`}
          key={item.id}
          item={item}
          isSelected={isKeyboardMode && index === selectedIndex}
          windowPinned={isWindowPinned}
          isEditingTags={isEditingTags}
          tagSuggestions={isEditingTags ? allTags : EMPTY_TAG_SUGGESTIONS}
          tagColors={tagColors}
          theme={theme}
          language={language}
          t={t}
          showSourceAppIcon={showSourceAppIcon}
          compactMode={compactMode}
          quickPasteHint={quickPasteHintsById[item.id]}
          onSelect={() => setSelectedIndex(index)}
          onCopy={(withFormat) =>
            copyToClipboard(item.id, item.content, item.content_type, withFormat, item.is_pinned, item.tags || [])
          }
          onOpen={(e) => {
            e.stopPropagation();
            openContent(item);
          }}
          onTogglePin={(e) => togglePin(e, item.id, item.is_pinned)}
          onDelete={(e) => deleteEntry(e, item.id)}
          onToggleTagEditor={(e) => {
            e.stopPropagation();
            if (editingTagsId === item.id) {
              setEditingTagsId(null);
            } else {
              setEditingTagsId(item.id);
            }
          }}
          onTagPick={(picked) => {
            const next = picked.trim();
            if (!next || item.tags?.includes(next)) return;
            handleUpdateTags(item.id, [...(item.tags || []), next]);
            setEditingTagsId(null);
          }}
          onTagEditCancel={() => {
            setEditingTagsId(null);
          }}
          onTagDelete={(tag) => {
            handleUpdateTags(item.id, item.tags ? item.tags.filter((t) => t !== tag) : []);
          }}
          dragControls={dragControls}
          disableLayout={disableLayout}
        />
      );
    },
    [
      revealedIds, isKeyboardMode, selectedIndex, isWindowPinned,
      editingTagsId, allTags, tagColors, theme, language, t,
      showSourceAppIcon, compactMode, quickPasteHintsById,
      aiOptionsOpenId, setAiOptionsOpenId,
      copyToClipboard, setSelectedIndex, setRevealedIds,
      openContent, togglePin, deleteEntry, setEditingTagsId, handleUpdateTags
    ]
  );

  return { renderItemContent };
};
