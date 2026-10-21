// @ts-nocheck
import { useRef, useEffect, useLayoutEffect, useState, useMemo, memo } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor, getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
    Pin,
    PinOff,
    ExternalLink,
    Tag,
    X,
    FileText,
    Image as ImageIcon,
    ImageOff,
    GripVertical
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ClipboardItemProps } from "../types";
import {
    formatSensitivePreview,
    getConciseTime,
    getTagColor,
    getTagTextColor
} from "../../../shared/lib/utils";
import { toTauriLocalImageSrc } from "../../../shared/lib/localImageSrc";
import { getSourceAppIcon, peekSourceAppIcon } from "../../../shared/lib/sourceAppIcon";
import { registerCompactPreviewControls } from "../lib/compactPreviewControls";

const COMPACT_PREVIEW_LABEL = "compact-preview";
const COMPACT_PREVIEW_DEBUG = false;
const IS_MACOS =
    typeof navigator !== "undefined" &&
    (/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) || /Mac/i.test(navigator.platform));
const COMPACT_PREVIEW_WINDOW_SUPPORTED = true;
const COMPACT_PREVIEW_WARMUP_SUPPORTED = !IS_MACOS;
const compactPreviewLog = (...args: unknown[]) => {
    if (!COMPACT_PREVIEW_DEBUG) return;
    const ts = new Date().toISOString();
    console.log(`[CompactPreview][Main][${ts}]`, ...args);
};

type CompactPreviewAnchor = {
    clientX: number;
    clientY: number;
    screenX: number;
    screenY: number;
};

let compactPreviewWindow: WebviewWindow | null = null;
let compactPreviewCreating = false;
let compactPreviewReady: Promise<WebviewWindow | null> | null = null;
let compactPreviewMounted = false;
let compactPreviewMountedPromise: Promise<boolean> | null = null;
let compactPreviewResizeListener: Promise<() => void> | null = null;
let compactPreviewPendingShow = false;
let compactPreviewPendingAnchor: CompactPreviewAnchor | null = null;
let compactPreviewPendingTimer: ReturnType<typeof setTimeout> | null = null;
let compactPreviewLifecycleListenersReady: Promise<void> | null = null;

const loadWebviewWindowModule = async () => import("@tauri-apps/api/webviewWindow");

const setIgnoreBlurSafe = (ignore: boolean) => {
    compactPreviewLog("set_ignore_blur", { ignore });
    invoke("set_ignore_blur", { ignore }).catch(() => { });
};

const clearCompactPreviewPendingState = () => {
    compactPreviewLog("clear pending state");
    if (compactPreviewPendingTimer) {
        clearTimeout(compactPreviewPendingTimer);
        compactPreviewPendingTimer = null;
    }
    compactPreviewPendingShow = false;
    compactPreviewPendingAnchor = null;
};

const resolveAnchorPhysical = async (
    anchor: CompactPreviewAnchor,
    scale: number
): Promise<{ x: number; y: number }> => {
    try {
        const appWindow = getCurrentWindow();
        const outer = await appWindow.outerPosition();
        return {
            x: Math.round(outer.x + anchor.clientX * scale),
            y: Math.round(outer.y + anchor.clientY * scale)
        };
    } catch {
        return {
            x: Math.round(anchor.screenX * scale),
            y: Math.round(anchor.screenY * scale)
        };
    }
};

const pickPreviewPosition = (
    anchorX: number,
    anchorY: number,
    widthPx: number,
    heightPx: number,
    monitorPos: { x: number; y: number },
    monitorSize: { width: number; height: number },
    margin: number,
    offset: number,
    avoidRect?: { left: number; top: number; right: number; bottom: number } | null
) => {
    const left = monitorPos.x + margin;
    const top = monitorPos.y + margin;
    const right = monitorPos.x + monitorSize.width - margin;
    const bottom = monitorPos.y + monitorSize.height - margin;

    const clampPoint = (p: { x: number; y: number }) => ({
        x: Math.min(Math.max(p.x, left), right - widthPx),
        y: Math.min(Math.max(p.y, top), bottom - heightPx)
    });

    const intersectsAvoidRect = (p: { x: number; y: number }) => {
        if (!avoidRect) return false;
        const previewRect = {
            left: p.x, top: p.y, right: p.x + widthPx, bottom: p.y + heightPx
        };
        return !(
            previewRect.right <= avoidRect.left ||
            previewRect.left >= avoidRect.right ||
            previewRect.bottom <= avoidRect.top ||
            previewRect.top >= avoidRect.bottom
        );
    };

    const candidates = [
        { x: anchorX + offset, y: anchorY + offset },
        { x: anchorX + offset, y: anchorY - heightPx - offset },
        { x: anchorX - widthPx - offset, y: anchorY + offset },
        { x: anchorX - widthPx - offset, y: anchorY - heightPx - offset }
    ];

    const fits = (p: { x: number; y: number }) =>
        p.x >= left && p.y >= top && p.x + widthPx <= right && p.y + heightPx <= bottom;

    for (const c of candidates) {
        if (fits(c) && !intersectsAvoidRect(c)) return c;
    }

    if (avoidRect) {
        const outsideCandidates = [
            { x: avoidRect.right + offset, y: anchorY - Math.round(heightPx * 0.25) },
            { x: avoidRect.left - widthPx - offset, y: anchorY - Math.round(heightPx * 0.25) },
            { x: anchorX - Math.round(widthPx * 0.2), y: avoidRect.top - heightPx - offset },
            { x: anchorX - Math.round(widthPx * 0.2), y: avoidRect.bottom + offset }
        ].map(clampPoint);
        for (const c of outsideCandidates) {
            if (!intersectsAvoidRect(c)) return c;
        }
    }

    for (const c of candidates) {
        const clamped = clampPoint(c);
        if (!intersectsAvoidRect(clamped)) return clamped;
    }
    return clampPoint(candidates[0]);
};

const placeAndShowPendingCompactPreview = async (
    widthLogical: number,
    heightLogical: number,
    options?: { keepPending?: boolean }
) => {
    if (!compactPreviewPendingShow || !compactPreviewWindow || !compactPreviewPendingAnchor) return;

    const appWindow = getCurrentWindow();
    const scale = await appWindow.scaleFactor();
    const monitor = await currentMonitor();
    const monitorPos = monitor?.position || { x: 0, y: 0 };
    const monitorSize = monitor?.size || { width: 1920, height: 1080 };
    const margin = Math.round(10 * scale);
    const offset = Math.round(12 * scale);

    const widthPx = Math.round(widthLogical * scale);
    const heightPx = Math.round(heightLogical * scale);
    const anchorPx = await resolveAnchorPhysical(compactPreviewPendingAnchor, scale);
    const mainOuter = await appWindow.outerPosition().catch(() => null);
    const mainSize = await appWindow.outerSize().catch(() => null);
    const avoidRect = mainOuter && mainSize
        ? { left: mainOuter.x, top: mainOuter.y, right: mainOuter.x + mainSize.width, bottom: mainOuter.y + mainSize.height }
        : null;

    const target = pickPreviewPosition(anchorPx.x, anchorPx.y, widthPx, heightPx, monitorPos, monitorSize, margin, offset, avoidRect);

    setIgnoreBlurSafe(true);
    try {
        await compactPreviewWindow.setPosition(new PhysicalPosition(target.x, target.y));
        await compactPreviewWindow.show();
        if (!IS_MACOS) {
            try {
                await compactPreviewWindow.setAlwaysOnTop(false);
                await compactPreviewWindow.setAlwaysOnTop(true);
            } catch { }
        }
    } catch (err) {
        setIgnoreBlurSafe(false);
        throw err;
    }
    if (options?.keepPending) {
        // keep pending
    } else {
        clearCompactPreviewPendingState();
    }
};

const hideCompactPreviewGlobal = async () => {
    const previewWindow = compactPreviewWindow;
    clearCompactPreviewPendingState();
    setIgnoreBlurSafe(false);
    if (!previewWindow) return;
    try {
        await previewWindow.hide();
    } catch (err) {
        console.error("Failed to hide compact preview window:", err);
        compactPreviewWindow = null;
        compactPreviewMounted = false;
        compactPreviewMountedPromise = null;
    }
};

const forceHideCompactPreviewWindow = () => { void hideCompactPreviewGlobal(); };

const waitForCompactPreviewMounted = async (): Promise<boolean> => {
    if (compactPreviewMounted) return true;
    if (!compactPreviewMountedPromise) {
        compactPreviewMountedPromise = new Promise(async (resolve) => {
            const timeout = setTimeout(() => resolve(false), 1200);
            try {
                const unlisten = await listen("compact-preview-mounted", () => {
                    compactPreviewMounted = true;
                    clearTimeout(timeout);
                    unlisten();
                    resolve(true);
                });
            } catch { clearTimeout(timeout); resolve(false); }
        });
    }
    return compactPreviewMountedPromise;
};

const ensureCompactPreviewResizeListener = async (): Promise<void> => {
    if (compactPreviewResizeListener) { await compactPreviewResizeListener; return; }
    compactPreviewResizeListener = listen<{ width: number; height: number }>(
        "compact-preview-resize",
        async (event) => {
            const { width, height } = event.payload || {};
            if (!width || !height) return;
            try { await placeAndShowPendingCompactPreview(width, height); } catch (err) {
                console.error("Failed to resize compact preview window:", err);
            }
        }
    );
    await compactPreviewResizeListener;
};

const ensureCompactPreviewLifecycleListeners = async (): Promise<void> => {
    if (compactPreviewLifecycleListenersReady) { await compactPreviewLifecycleListenersReady; return; }
    compactPreviewLifecycleListenersReady = (async () => {
        const lifecycleEvents = ["tauri://hide", "tauri://close-requested", "tauri://destroyed"];
        await Promise.all(lifecycleEvents.map(async (eventName) => {
            try {
                await listen(eventName, () => { void hideCompactPreviewGlobal(); });
            } catch { }
        }));
    })();
    await compactPreviewLifecycleListenersReady;
};

const tryReuseExistingCompactPreviewWindow = async (): Promise<WebviewWindow | null> => {
    try {
        const { WebviewWindow } = await loadWebviewWindowModule();
        const existing = await WebviewWindow.getByLabel(COMPACT_PREVIEW_LABEL);
        if (!existing) return null;
        compactPreviewWindow = existing;
        compactPreviewMounted = true;
        compactPreviewMountedPromise = Promise.resolve(true);
        try { await existing.setIgnoreCursorEvents(true); } catch { }
        try { await existing.setAlwaysOnTop(true); } catch { }
        return existing;
    } catch { return null; }
};

const ensureCompactPreviewWindow = async (): Promise<WebviewWindow | null> => {
    if (!COMPACT_PREVIEW_WINDOW_SUPPORTED) return null;
    if (compactPreviewWindow) {
        compactPreviewMounted = true;
        compactPreviewMountedPromise = Promise.resolve(true);
        return compactPreviewWindow;
    }
    if (compactPreviewReady) return compactPreviewReady;
    if (compactPreviewCreating) return null;
    const reusedBeforeCreate = await tryReuseExistingCompactPreviewWindow();
    if (reusedBeforeCreate) return reusedBeforeCreate;
    compactPreviewCreating = true;
    compactPreviewReady = (async () => {
        try {
            const { WebviewWindow } = await loadWebviewWindowModule();
            const previewWindow = new WebviewWindow(COMPACT_PREVIEW_LABEL, {
                url: "index.html?window=compact-preview",
                decorations: false, transparent: true, resizable: false,
                skipTaskbar: true, alwaysOnTop: true, visible: false,
                focus: false, focusable: false, shadow: false
            });
            compactPreviewMounted = false;
            compactPreviewMountedPromise = null;
            const created = await new Promise<boolean>((resolve) => {
                const timeout = setTimeout(() => resolve(false), 1500);
                previewWindow.once("tauri://created", () => { clearTimeout(timeout); resolve(true); });
                previewWindow.once("tauri://error", () => { clearTimeout(timeout); resolve(false); });
            });
            if (!created) {
                const reusedAfterFailedCreate = await tryReuseExistingCompactPreviewWindow();
                if (reusedAfterFailedCreate) return reusedAfterFailedCreate;
                return null;
            }
            try { await previewWindow.setSize(new PhysicalSize(1, 1)); } catch { }
            try { await previewWindow.setIgnoreCursorEvents(true); } catch { }
            compactPreviewWindow = previewWindow;
            return previewWindow;
        } catch { return null; } finally { compactPreviewCreating = false; compactPreviewReady = null; }
    })();
    return compactPreviewReady;
};

const warmupCompactPreviewWindow = () => {
    if (!COMPACT_PREVIEW_WINDOW_SUPPORTED || !COMPACT_PREVIEW_WARMUP_SUPPORTED) return;
    if (compactPreviewWindow || compactPreviewCreating || compactPreviewReady) return;
    ensureCompactPreviewWindow().catch(() => { });
};

const isCompactPreviewWindowSupported = () => COMPACT_PREVIEW_WINDOW_SUPPORTED;
const isCompactPreviewWarmupSupported = () => COMPACT_PREVIEW_WARMUP_SUPPORTED;

registerCompactPreviewControls({
    forceHide: forceHideCompactPreviewWindow,
    warmup: warmupCompactPreviewWindow,
    supported: isCompactPreviewWindowSupported,
    warmupSupported: isCompactPreviewWarmupSupported,
});

const getIcon = (type: string) => {
    switch (type) {
        case "image": return <ImageIcon size={14} />;
        default: return <FileText size={14} />;
    }
};

const renderSourceAppIcon = (iconSrc: string | null, contentType: string, sourceApp: string) => {
    if (!iconSrc) return getIcon(contentType);
    return (
        <img src={iconSrc} alt={`${sourceApp} icon`} className="source-app-icon" loading="lazy" />
    );
};

const ClipboardItem = ({
    item, isSelected, isSensitiveHidden: _isSensitiveHidden, isRevealed: _isRevealed,
    isEditingTags, tagInput: _tagInput,
    tagSuggestions = [], theme, language, t,
    isAIProcessing: _isAIProcessing,
    onSelect, onCopy, onToggleReveal: _onToggleReveal,
    onOpen, onTogglePin, onDelete, onToggleTagEditor,
    onTagInput: _onTagInput, onTagAdd: _onTagAdd, onTagPick, onTagEditCancel, onTagDelete,
    onAIAction: _onAIAction, onInputSubmit: _onInputSubmit,
    aiEnabled: _aiEnabled, aiOptionsOpen: _aiOptionsOpen,
    onAIOptionsToggle: _onAIOptionsToggle,
    tagColors, showSourceAppIcon = true,
    quickPasteHint, dragControls, id, compactMode, className, disableLayout
}: ClipboardItemProps & { compactMode?: boolean; className?: string }) => {
    const itemRef = useRef<HTMLDivElement | null>(null);
    const [sourceAppIcon, setSourceAppIcon] = useState<string | null>(() => peekSourceAppIcon(item.source_app_path) ?? null);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hoverAnchorRef = useRef<CompactPreviewAnchor | null>(null);
    const hoverRequestIdRef = useRef(0);

    const visibleTagCount = item.tags?.length || 0;
    const hasTagsSection = visibleTagCount > 0 || isEditingTags;
    const overlayTagsInPreview = !compactMode && !isEditingTags && visibleTagCount > 0;

    useEffect(() => {
        let cancelled = false;
        const sourceAppPath = item.source_app_path?.trim();
        const cachedIcon = peekSourceAppIcon(sourceAppPath);
        if (!showSourceAppIcon) { setSourceAppIcon(null); return () => { cancelled = true; }; }
        if (cachedIcon !== undefined) { setSourceAppIcon(cachedIcon ?? null); return () => { cancelled = true; }; }
        setSourceAppIcon(null);
        if (!sourceAppPath) return () => { cancelled = true; };
        getSourceAppIcon(sourceAppPath).then((icon) => { if (!cancelled) setSourceAppIcon(icon); });
        return () => { cancelled = true; };
    }, [item.source_app_path, showSourceAppIcon]);

    const compactPreviewEnabled =
        compactMode && COMPACT_PREVIEW_WINDOW_SUPPORTED && item.content_type !== "file";

    const isHoverPreviewRequestCurrent = (requestId: number) => {
        const node = itemRef.current;
        return hoverRequestIdRef.current === requestId && !!hoverAnchorRef.current && !!node && node.isConnected && node.matches(":hover");
    };

    const cancelHoverPreview = () => {
        hoverRequestIdRef.current += 1;
        if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
        hoverAnchorRef.current = null;
    };

    const hideCompactPreview = async () => { cancelHoverPreview(); await hideCompactPreviewGlobal(); };

    const showCompactPreview = async (anchor: CompactPreviewAnchor, requestId: number) => {
        if (!compactPreviewEnabled) return;
        if (!isHoverPreviewRequestCurrent(requestId)) return;
        let previewWindow = await ensureCompactPreviewWindow();
        if (!isHoverPreviewRequestCurrent(requestId)) return;
        if (!previewWindow) return;
        await ensureCompactPreviewLifecycleListeners();
        if (!isHoverPreviewRequestCurrent(requestId)) return;
        await ensureCompactPreviewResizeListener();
        if (!isHoverPreviewRequestCurrent(requestId)) return;
        const mounted = await waitForCompactPreviewMounted();
        if (!isHoverPreviewRequestCurrent(requestId)) return;
        try {
            const rootStyle = getComputedStyle(document.documentElement);
            const clipboardItemFontSizeRaw = parseInt(rootStyle.getPropertyValue("--clipboard-item-font-size"));
            const clipboardTagFontSizeRaw = parseInt(rootStyle.getPropertyValue("--clipboard-tag-font-size"));
            const clipboardItemFontSize = Number.isFinite(clipboardItemFontSizeRaw) ? clipboardItemFontSizeRaw : undefined;
            const clipboardTagFontSize = Number.isFinite(clipboardTagFontSizeRaw) ? clipboardTagFontSizeRaw : undefined;
            const colorMode = document.documentElement.classList.contains("dark-mode") ? "dark" : "light";
            if (!isHoverPreviewRequestCurrent(requestId)) return;
            compactPreviewPendingShow = true;
            compactPreviewPendingAnchor = anchor;
            await previewWindow.emit("compact-preview-update", {
                contentType: item.content_type, content: item.content,
                preview: item.preview, htmlContent: item.html_content,
                sourceApp: item.source_app, timestamp: item.timestamp,
                language, theme, colorMode, clipboardItemFontSize, clipboardTagFontSize
            });
            if (compactPreviewPendingTimer) clearTimeout(compactPreviewPendingTimer);
            compactPreviewPendingTimer = setTimeout(async () => {
                if (!compactPreviewPendingShow || !compactPreviewWindow || !compactPreviewPendingAnchor) return;
                try { await placeAndShowPendingCompactPreview(320, 220, { keepPending: true }); } catch { }
            }, 200);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("window not found")) {
                compactPreviewWindow = null; compactPreviewMounted = false; compactPreviewMountedPromise = null;
                previewWindow = await ensureCompactPreviewWindow();
                if (!isHoverPreviewRequestCurrent(requestId)) return;
                if (!previewWindow) return;
                try {
                    compactPreviewPendingShow = true; compactPreviewPendingAnchor = anchor;
                    await previewWindow.emit("compact-preview-update", {
                        contentType: item.content_type, content: item.content,
                        preview: item.preview, htmlContent: item.html_content,
                        sourceApp: item.source_app, timestamp: item.timestamp,
                        language, theme,
                        richTextSnapshotPreview: false,
                        colorMode: document.documentElement.classList.contains("dark-mode") ? "dark" : "light"
                    });
                    if (compactPreviewPendingTimer) clearTimeout(compactPreviewPendingTimer);
                    compactPreviewPendingTimer = setTimeout(async () => {
                        if (!compactPreviewPendingShow || !compactPreviewWindow || !compactPreviewPendingAnchor) return;
                        try { await placeAndShowPendingCompactPreview(320, 220, { keepPending: true }); } catch { }
                    }, 200);
                } catch { }
                return;
            }
            console.error("Failed to show compact preview window:", err);
        }
    };

    useEffect(() => {
        if (!compactPreviewEnabled) { void hideCompactPreview(); }
    }, [compactPreviewEnabled]);

    useEffect(() => {
        return () => { cancelHoverPreview(); void hideCompactPreviewGlobal(); };
    }, []);

    // Tag editor: pick-list only (no input), click outside closes
    useEffect(() => {
        if (!isEditingTags || !onTagEditCancel) return;
        const onDocMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            const root = itemRef.current;
            if (!root) return;
            const t = e.target as HTMLElement;
            if (root.contains(t)) {
                if (t.closest(".tag-pick-anchor")) return;
                if (t.closest(".item-tags-container .tag-chip")) return;
                if (t.closest("button") || t.closest("input") || t.closest("textarea") ||
                    t.closest('[role="button"]') || t.closest(".drag-handle")) return;
            }
            onTagEditCancel();
            e.preventDefault(); e.stopPropagation();
        };
        document.addEventListener("mousedown", onDocMouseDown, true);
        return () => document.removeEventListener("mousedown", onDocMouseDown, true);
    }, [isEditingTags, onTagEditCancel]);

    const pickableTagSuggestions = useMemo(() => {
        if (!isEditingTags) return [];
        const existing = new Set(item.tags || []);
        return tagSuggestions.filter((tag) => !existing.has(tag));
    }, [isEditingTags, item.tags, tagSuggestions]);

    const renderTagsContainer = (overlay = false) => (
        <div
            className={`item-tags-container${overlay ? ' overlay' : ''}${isEditingTags ? ' tag-edit-active' : ''}`}
            style={{
                marginTop: overlay ? '0' : '2px',
                display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '4px', paddingTop: '0'
            }}
        >
            {item.tags?.map((tag) => {
                const tagBackground = tagColors?.[tag] || getTagColor(tag, theme);
                const tagTextColor = getTagTextColor(tag, tagBackground);
                return (
                    <span key={tag} className="tag-chip"
                        style={{ background: tagBackground, color: tagTextColor, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {tag}
                        {isEditingTags && (
                            <button onClick={(e) => { e.stopPropagation(); onTagDelete(tag); }}
                                style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', opacity: 0.72, cursor: 'pointer', display: 'flex' }}>
                                <X size={8} />
                            </button>
                        )}
                    </span>
                );
            })}

            {isEditingTags && (
                <div className="tag-pick-anchor" style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center' }}>
                    {pickableTagSuggestions.length > 0 ? (
                        pickableTagSuggestions.map((sTag) => {
                            const bg = tagColors?.[sTag] || getTagColor(sTag, theme);
                            const fg = getTagTextColor(sTag, bg);
                            return (
                                <button key={sTag} type="button"
                                    onClick={(e) => { e.stopPropagation(); onTagPick(sTag); }}
                                    className="tag-chip tag-pick-chip"
                                    style={{
                                        background: bg, color: fg, cursor: 'pointer', border: 'none',
                                        opacity: 0.7, fontSize: '10px', padding: '1px 6px', borderRadius: '4px'
                                    }}>
                                    +{sTag}
                                </button>
                            );
                        })
                    ) : (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.6 }}>
                            {t('no_tags_yet') || '暂无标签，请先在顶部搜索栏旁按 + 添加'}
                        </span>
                    )}
                </div>
            )}
        </div>
    );

    return (
        <motion.div
            ref={itemRef} id={id} data-test-clipboard-item
            layout={!disableLayout} initial={false}
            animate={{ marginBottom: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className={`history-item ${isSelected ? "selected" : ""} ${compactMode ? "compact" : ""} ${item.is_pinned ? "pinned" : ""} ${className || ''}`}
            onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                if (e.button !== 0) return;
                if (isEditingTags) {
                    if (target.closest(".tag-pick-anchor")) return;
                    if (target.closest(".item-tags-container .tag-chip")) return;
                    if (target.closest('button, input, textarea, [role="button"], .drag-handle')) return;
                    if (target.closest('a')) return;
                    e.preventDefault(); e.stopPropagation();
                    onTagEditCancel?.();
                    return;
                }
                if (target.closest('button, input, textarea, [role="button"], .drag-handle')) return;
                if (target.closest('a')) return;
                e.preventDefault();
                void hideCompactPreview();
                onCopy(false);
                onSelect();
            }}
            onClick={(e) => {
                if (isEditingTags) return;
                const target = e.target as HTMLElement;
                if (target.closest('button') || target.closest('input') || target.closest('textarea')) return;
                if (target.closest('a')) e.preventDefault();
            }}
            onContextMenu={(e) => {
                const target = e.target as HTMLElement;
                if (isEditingTags) {
                    if (target.closest(".tag-pick-anchor")) return;
                    e.preventDefault(); e.stopPropagation();
                    onTagEditCancel?.();
                    return;
                }
                if (target.closest('button') || target.closest('input') || target.closest('textarea')) return;
                void hideCompactPreview();
                e.preventDefault();
                if (target.closest('a')) e.stopPropagation();
                onCopy(true);
                onSelect();
            }}
            onMouseEnter={(e) => {
                if (!compactPreviewEnabled) return;
                const requestId = hoverRequestIdRef.current + 1;
                hoverRequestIdRef.current = requestId;
                hoverAnchorRef.current = { clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY };
                const target = e.currentTarget;
                if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = setTimeout(() => {
                    hoverTimerRef.current = null;
                    if (!target.isConnected) return;
                    if (!isHoverPreviewRequestCurrent(requestId)) return;
                    const anchor = hoverAnchorRef.current;
                    if (!anchor) return;
                    void showCompactPreview(anchor, requestId);
                }, 1000);
            }}
            onMouseMove={(e) => {
                if (!compactPreviewEnabled) return;
                hoverAnchorRef.current = { clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY };
            }}
            onMouseLeave={() => { void hideCompactPreview(); }}
        >
            <div className="item-meta">
                <div className="item-meta-left">
                    {dragControls && (
                        <div className="drag-handle" onPointerDown={(e) => dragControls.start(e)} onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'grab', opacity: 0.5, display: 'flex', alignItems: 'center', touchAction: 'none' }}>
                            <GripVertical size={14} />
                        </div>
                    )}
                    <div className="app-info">
                        {item.is_pinned && !dragControls && <Pin size={10} style={{ color: 'var(--accent-color)', marginRight: '-2px' }} />}
                        {showSourceAppIcon
                            ? renderSourceAppIcon(sourceAppIcon, item.content_type, item.source_app)
                            : getIcon(item.content_type)}
                        <span>{item.source_app}</span>
                    </div>
                </div>
                <div className="item-meta-right">
                    <div className="item-actions">
                        <button className="btn-icon" onClick={onOpen} title={t('open')}>
                            <ExternalLink size={12} />
                        </button>
                        <button className={`btn-icon ${item.is_pinned ? "active" : ""}`} onClick={onTogglePin}
                            title={item.is_pinned ? t('unpin') : t('pin')}>
                            {item.is_pinned ? <PinOff size={12} /> : <Pin size={12} />}
                        </button>
                        <button className={`btn-icon ${item.tags && item.tags.length > 0 ? "active" : ""}`}
                            onClick={onToggleTagEditor} title="Tags">
                            <Tag size={12} />
                        </button>
                        <button className="btn-icon" onClick={onDelete} title={t('delete')}>
                            <X size={12} />
                        </button>
                    </div>
                    <div className="item-meta-right-info">
                        {quickPasteHint && item.is_pinned && (
                            <span className="quick-paste-hint" title={`${t('quick_paste_modifier')}: ${quickPasteHint.combo}`}>
                                {quickPasteHint.combo}
                            </span>
                        )}
                        <span>{getConciseTime(item.timestamp, language)}</span>
                    </div>
                </div>
            </div>

            {compactMode && item.is_pinned && (
                <div className="compact-pinned-indicator" title={t('pinned')}>
                    <Pin size={10} fill="currentColor" />
                </div>
            )}
            <div className={`content-preview-shell${overlayTagsInPreview ? ' has-overlay-tags' : ''}`}>
                <div className="content-preview">
                {item.content_type === "image" ? (
                    <div style={{ position: 'relative' }}>
                        {item.is_external && item.file_preview_exists === false ? (
                            <div className="image-preview error-placeholder"
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    background: 'var(--bg-secondary)', color: 'var(--text-secondary)', height: '100px', fontSize: '12px' }}>
                                <ImageOff size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                                <span>{t('image_deleted') || 'Image Deleted'}</span>
                            </div>
                        ) : (
                            <img
                                src={
                                    item.content.startsWith("data:")
                                        ? item.content
                                        : (toTauriLocalImageSrc(item.content) ||
                                            (item.is_external ? convertFileSrc(item.content) : item.content))
                                }
                                alt={t('image_preview')} className="image-preview" loading="lazy"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement?.classList.add('image-load-error');
                                }}
                            />
                        )}
                    </div>
                ) : (
                    item.preview
                )}
                {overlayTagsInPreview && renderTagsContainer(true)}
                </div>
            </div>

            {!overlayTagsInPreview && hasTagsSection && renderTagsContainer()}
        </motion.div>
    );
};

export default memo(ClipboardItem, (prevProps, nextProps) => {
    return prevProps.isSelected === nextProps.isSelected &&
        prevProps.item.id === nextProps.item.id &&
        prevProps.item.content_type === nextProps.item.content_type &&
        prevProps.item.timestamp === nextProps.item.timestamp &&
        prevProps.item.content === nextProps.item.content &&
        prevProps.item.preview === nextProps.item.preview &&
        prevProps.item.source_app === nextProps.item.source_app &&
        prevProps.item.source_app_path === nextProps.item.source_app_path &&
        prevProps.item.is_pinned === nextProps.item.is_pinned &&
        prevProps.item.is_external === nextProps.item.is_external &&
        prevProps.item.file_preview_exists === nextProps.item.file_preview_exists &&
        prevProps.item.tags === nextProps.item.tags &&
        prevProps.isEditingTags === nextProps.isEditingTags &&
        prevProps.showSourceAppIcon === nextProps.showSourceAppIcon &&
        prevProps.quickPasteHint?.slot === nextProps.quickPasteHint?.slot &&
        prevProps.quickPasteHint?.combo === nextProps.quickPasteHint?.combo &&
        prevProps.compactMode === nextProps.compactMode &&
        prevProps.theme === nextProps.theme &&
        prevProps.language === nextProps.language &&
        (prevProps.tagSuggestions ?? []).join('\u0000') === (nextProps.tagSuggestions ?? []).join('\u0000');
});
