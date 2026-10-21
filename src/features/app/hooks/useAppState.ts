import { useState } from "react";
import { DEFAULT_THEME } from "../../../shared/config/themes";
import type { ClipboardEntry, Locale } from "../../../shared/types";
import type {
  AppState,
  DefaultAppsMap,
  InstalledAppOption,
  QuickPasteModifier,
  SettingsSubpage
} from "../types";
import type { AppCleanupPolicy } from "../../settings/types";


export const useAppState = (): AppState => {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSubpage, setSettingsSubpage] = useState<SettingsSubpage>("home");
  const [showTagManager, setShowTagManager] = useState(false);
  const [tagManagerEnabled, setTagManagerEnabled] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    general: true,
    clipboard: true,
    advanced: true,
    appearance: true,
    sync: true,
    cloud_sync: true,
    ai: true,
    file_transfer: true,
    default_apps: true,
    data: true
  });
  const [history, setHistory] = useState<ClipboardEntry[]>([]);
  const [search, setSearch] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [searchIsFocused, setSearchIsFocused] = useState(false);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [emojiFavorites, setEmojiFavorites] = useState<string[]>([]);
  const [imageFavorites, setImageFavorites] = useState<string[]>([]);
  const [aiOptionsOpenId, setAiOptionsOpenId] = useState<number | null>(null);
  const [editingTagsId, setEditingTagsId] = useState<number | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [autoStart, setAutoStart] = useState(true);
  const [deduplicate, setDeduplicate] = useState(true);
  const [persistent, setPersistent] = useState(true);
  const [persistentLimitEnabled, setPersistentLimitEnabled] = useState(true);
  const [persistentLimit, setPersistentLimit] = useState<number>(1000);
  const [appSettings, setAppSettings] = useState<Record<string, string>>({});
  const [defaultApps, setDefaultApps] = useState<DefaultAppsMap>({});
  const [showAppSelector, setShowAppSelector] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState(false);
  const [installedApps, setInstalledApps] = useState<InstalledAppOption[]>([]);
  const [dataPath, setDataPath] = useState<string>("");
  const [hotkey, setHotkey] = useState<string>("Alt+C");
  const [sequentialHotkey, setSequentialHotkey] = useState<string>("Alt+V");
  const [richPasteHotkey, setRichPasteHotkey] = useState<string>("Alt+Shift+V");
  const [searchHotkey, setSearchHotkey] = useState<string>("Alt+F");
  const [quickPasteModifier, setQuickPasteModifier] =
    useState<QuickPasteModifier>("disabled");
  const [sequentialMode, setSequentialModeState] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingSequential, setIsRecordingSequential] = useState(false);
  const [isRecordingRich, setIsRecordingRich] = useState(false);
  const [isRecordingSearch, setIsRecordingSearch] = useState(false);
  const [deleteAfterPaste, setDeleteAfterPaste] = useState(false);
  const [moveToTopAfterPaste, setMoveToTopAfterPaste] = useState(true);
  const [cleanupRules, setCleanupRules] = useState<string>("");
  const [appCleanupPolicies, setAppCleanupPolicies] = useState<AppCleanupPolicy[]>([]);
  const [captureImages, setCaptureImages] = useState(true);
  const [silentStart, setSilentStart] = useState(true);
  const [followMouse, setFollowMouse] = useState(false);
  const [showAppBorder, setShowAppBorder] = useState(false);
  const [winClipboardDisabled, setWinClipboardDisabled] = useState(false);
  const [registryWinVEnabled, setRegistryWinVEnabled] = useState(false);
  const [pasteMethod, setPasteMethod] = useState("simulate");
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [colorMode, setColorMode] = useState("system");
  const [showSourceAppIcon, setShowSourceAppIcon] = useState(true);

  const [compactMode, setCompactMode] = useState(false);
  const [clipboardItemFontSize, setClipboardItemFontSize] = useState(13);
  const [clipboardTagFontSize, setClipboardTagFontSize] = useState(10);
  const [emojiPanelEnabled, setEmojiPanelEnabled] = useState(true);
  const [emojiPanelTab, setEmojiPanelTab] = useState<"emoji" | "favorites">("favorites");
  const [showHotkeyHint, setShowHotkeyHint] = useState(false);
  const [showAutoCloseHint, setShowAutoCloseHint] = useState(false);
  const [language, setLanguage] = useState<Locale>("zh");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [isWindowPinned, setIsWindowPinned] = useState(false);
  const [showSearchBox, setShowSearchBox] = useState(true);
  const [scrollTopButtonEnabled, setScrollTopButtonEnabled] = useState(true);
  const [arrowKeySelection, setArrowKeySelection] = useState(true);
  const [hideTrayIcon, setHideTrayIcon] = useState(false);
  const [hideDockIcon, setHideDockIcon] = useState(false);
  const [edgeDocking, setEdgeDocking] = useState(false);
  const [customBackground, setCustomBackground] = useState<string>("");
  const [customBackgroundOpacity, setCustomBackgroundOpacity] = useState(45);
  const [surfaceOpacity, setSurfaceOpacity] = useState(50);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [fileServerEnabled, setFileServerEnabled] = useState(false);
  const [fileServerPort, setFileServerPort] = useState("12345");
  const [localIp, setLocalIp] = useState("");
  const [availableIps, setAvailableIps] = useState<string[]>([]);
  const [actualPort, setActualPort] = useState("");
  const [fileTransferPath, setFileTransferPath] = useState("");
  const [fileTransferAutoOpen, setFileTransferAutoOpen] = useState(false);
  const [fileTransferAutoCopy, setFileTransferAutoCopy] = useState(false);
  const [fileServerAutoClose, setFileServerAutoClose] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [pasteSoundEnabled, setPasteSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(1.0);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiTargetLang, setAiTargetLang] = useState("zh");
  const [aiThinkingBudget, setAiThinkingBudget] = useState("1024");
  const [processingAiId, setProcessingAiId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  return {
    showSettings,
    setShowSettings,
    settingsSubpage,
    setSettingsSubpage,
    showTagManager,
    setShowTagManager,
    tagManagerEnabled,
    setTagManagerEnabled,
    collapsedGroups,
    setCollapsedGroups,
    history,
    setHistory,
    search,
    setSearch,
    isComposing,
    setIsComposing,
    searchIsFocused,
    setSearchIsFocused,
    showTagFilter,
    setShowTagFilter,
    tagInput,
    setTagInput,
    showEmojiPanel,
    setShowEmojiPanel,
    emojiFavorites,
    setEmojiFavorites,
    imageFavorites,
    setImageFavorites,
    aiOptionsOpenId,
    setAiOptionsOpenId,
    editingTagsId,
    setEditingTagsId,
    revealedIds,
    setRevealedIds,
    autoStart,
    setAutoStart,
    deduplicate,
    setDeduplicate,
    persistent,
    setPersistent,
    persistentLimitEnabled,
    setPersistentLimitEnabled,
    persistentLimit,
    setPersistentLimit,
    appSettings,
    setAppSettings,
    defaultApps,
    setDefaultApps,
    showAppSelector,
    setShowAppSelector,
    chatMode,
    setChatMode,
    installedApps,
    setInstalledApps,
    dataPath,
    setDataPath,
    hotkey,
    setHotkey,
    sequentialHotkey,
    setSequentialHotkey,
    richPasteHotkey,
    setRichPasteHotkey,
    searchHotkey,
    setSearchHotkey,
    quickPasteModifier,
    setQuickPasteModifier,
    sequentialMode,
    setSequentialModeState,
    isRecording,
    setIsRecording,
    isRecordingSequential,
    setIsRecordingSequential,
    isRecordingRich,
    setIsRecordingRich,
    isRecordingSearch,
    setIsRecordingSearch,
    deleteAfterPaste,
    setDeleteAfterPaste,
    moveToTopAfterPaste,
    setMoveToTopAfterPaste,
    cleanupRules,
    setCleanupRules,
    appCleanupPolicies,
    setAppCleanupPolicies,
    captureImages,
    setCaptureImages,
    silentStart,
    setSilentStart,
    followMouse,
    setFollowMouse,
    showAppBorder,
    setShowAppBorder,
    winClipboardDisabled,
    setWinClipboardDisabled,
    registryWinVEnabled,
    setRegistryWinVEnabled,
    pasteMethod,
    setPasteMethod,
    theme,
    setTheme,
    colorMode,
    setColorMode,
    showSourceAppIcon,
    setShowSourceAppIcon,

    compactMode,
    setCompactMode,
    clipboardItemFontSize,
    setClipboardItemFontSize,
    clipboardTagFontSize,
    setClipboardTagFontSize,
    emojiPanelEnabled,
    setEmojiPanelEnabled,
    emojiPanelTab,
    setEmojiPanelTab,
    showHotkeyHint,
    setShowHotkeyHint,
    showAutoCloseHint,
    setShowAutoCloseHint,
    language,
    setLanguage,
    settingsLoaded,
    setSettingsLoaded,
    isWindowPinned,
    setIsWindowPinned,
    showSearchBox,
    setShowSearchBox,
    scrollTopButtonEnabled,
    setScrollTopButtonEnabled,
    arrowKeySelection,
    setArrowKeySelection,
    hideTrayIcon,
    setHideTrayIcon,
    hideDockIcon,
    setHideDockIcon,
    edgeDocking,
    setEdgeDocking,

    customBackground,
    setCustomBackground,
    customBackgroundOpacity,
    setCustomBackgroundOpacity,
    surfaceOpacity,
    setSurfaceOpacity,
    selectedIndex,
    setSelectedIndex,
    isKeyboardMode,
    setIsKeyboardMode,
    isLoadingMore,
    setIsLoadingMore,
    hasMore,
    setHasMore,
    currentOffset,
    setCurrentOffset,
    fileServerEnabled,
    setFileServerEnabled,
    fileServerPort,
    setFileServerPort,
    localIp,
    setLocalIp,
    availableIps,
    setAvailableIps,
    actualPort,
    setActualPort,
    fileTransferPath,
    setFileTransferPath,
    fileTransferAutoOpen,
    setFileTransferAutoOpen,
    fileTransferAutoCopy,
    setFileTransferAutoCopy,
    fileServerAutoClose,
    setFileServerAutoClose,
    soundEnabled,
    setSoundEnabled,
    pasteSoundEnabled,
    setPasteSoundEnabled,
    soundVolume,
    setSoundVolume,
    aiEnabled,
    setAiEnabled,
    aiTargetLang,
    setAiTargetLang,
    aiThinkingBudget,
    setAiThinkingBudget,
    processingAiId,
    setProcessingAiId,
    typeFilter,
    setTypeFilter,
    tagFilter,
    setTagFilter
  };
};
