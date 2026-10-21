// @ts-nocheck
import { useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getHotkeyDisplayTokens } from "../../../../shared/lib/hotkeyDisplay";
import { isMacPlatform } from "../../../../shared/lib/platform";
import type { QuickPasteModifier } from "../../../app/types";

interface LabelWithHintProps {
    label: string;
    hint?: string | ReactNode;
    hintKey: string;
}

interface ClipboardSettingsGroupProps {
    t: (key: string) => string;
    collapsed: boolean;
    onToggle: () => void;
    LabelWithHint: ComponentType<LabelWithHintProps>;
    persistent: boolean;
    setPersistent: (val: boolean) => void;
    persistentLimitEnabled: boolean;
    setPersistentLimitEnabled: (val: boolean) => void;
    persistentLimit: number;
    setPersistentLimit: (val: number) => void;
    saveAppSetting: (key: string, val: string) => void;
    deduplicate: boolean;
    setDeduplicate: (val: boolean) => void;
    captureImages: boolean;
    setCaptureImages: (val: boolean) => void;
    richPasteHotkey: string;
    isRecordingRich: boolean;
    setIsRecordingRich: (val: boolean) => void;
    updateRichPasteHotkey: (key: string) => void;
    searchHotkey: string;
    isRecordingSearch: boolean;
    setIsRecordingSearch: (val: boolean) => void;
    updateSearchHotkey: (key: string) => void;
    quickPasteModifier: QuickPasteModifier;
    setQuickPasteModifier: (val: QuickPasteModifier) => void;
    deleteAfterPaste: boolean;
    setDeleteAfterPaste: (val: boolean) => void;
    moveToTopAfterPaste: boolean;
    setMoveToTopAfterPaste: (val: boolean) => void;
    sequentialMode: boolean;
    setSequentialModeState: (val: boolean) => void;
    sequentialHotkey: string;
    isRecordingSequential: boolean;
    setIsRecordingSequential: (val: boolean) => void;
    updateSequentialHotkey: (key: string) => void;
    checkHotkeyConflict: (newHotkey: string, mode: 'main' | 'sequential' | 'rich' | 'search') => boolean;
    isRecording: boolean;
    setIsRecording: (val: boolean) => void;
    hotkeyParts: string[];
    updateHotkey: (key: string) => void;
    hotkey: string;
    appSettings: Record<string, string>;
    theme: string;
    colorMode: string;
}

const ClipboardSettingsGroup = ({
    t,
    collapsed,
    onToggle,
    LabelWithHint,
    persistent,
    setPersistent,
    persistentLimitEnabled,
    setPersistentLimitEnabled,
    persistentLimit,
    setPersistentLimit,
    saveAppSetting,
    deduplicate,
    setDeduplicate,
    captureImages,
    setCaptureImages,
    richPasteHotkey,
    isRecordingRich,
    setIsRecordingRich,
    updateRichPasteHotkey,
    searchHotkey,
    isRecordingSearch,
    setIsRecordingSearch,
    updateSearchHotkey,
    quickPasteModifier,
    setQuickPasteModifier,
    deleteAfterPaste,
    setDeleteAfterPaste,
    moveToTopAfterPaste,
    setMoveToTopAfterPaste,
    sequentialMode,
    setSequentialModeState,
    sequentialHotkey,
    isRecordingSequential,
    setIsRecordingSequential,
    updateSequentialHotkey,
    checkHotkeyConflict,
    isRecording,
    setIsRecording,
    hotkeyParts,
    updateHotkey,
    hotkey,
    appSettings,
    theme,
    colorMode
}: ClipboardSettingsGroupProps) => {
    const [showHotkeyHint, setShowHotkeyHint] = useState(appSettings?.show_hotkey_hint !== "false");
    const isMac = isMacPlatform();

    const modifierLabels: Record<Exclude<QuickPasteModifier, "disabled">, string> = isMac
        ? { ctrl: "⌃", alt: "⌥", shift: "⇧", win: "⌘" }
        : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", win: "Win" };

    const [quickPasteOpen, setQuickPasteOpen] = useState(false);

    useEffect(() => {
        setShowHotkeyHint(appSettings?.show_hotkey_hint !== "false");
    }, [appSettings]);

    return (
        <div className={`settings-group ${collapsed ? 'collapsed' : ''}`}>
            <div className="group-header" onClick={onToggle}>
                <h3 style={{ margin: 0 }}>{t('clipboard_settings')}</h3>
                {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </div>
            {!collapsed && (
                <div className="group-content">
                    <div className="setting-item">
                        <div className="item-label-group">
                            <span className="item-label">{t('persistent_storage')}</span>
                            <span className="hint">{t('persistent_hint')}</span>
                        </div>
                        <label className="switch">
                            <input className="cb" type="checkbox" checked={persistent} onChange={(e) => { const val = e.target.checked; setPersistent(val); invoke("set_persistence", { enabled: val }).catch(console.error); }} />
                            <div className="toggle"><div className="left" /><div className="right" /></div>
                        </label>
                    </div>

                    <div className="setting-item">
                        <div className="item-label-group">
                            <span className="item-label">{t('persistent_limit_enabled')}</span>
                            <span className="hint">{t('persistent_limit_enabled_hint')}</span>
                        </div>
                        <label className="switch">
                            <input className="cb" type="checkbox" checked={persistentLimitEnabled} onChange={(e) => { const val = e.target.checked; setPersistentLimitEnabled(val); saveAppSetting('persistent_limit_enabled', String(val)); }} />
                            <div className="toggle"><div className="left" /><div className="right" /></div>
                        </label>
                    </div>
                    {persistentLimitEnabled && (
                        <div className="setting-item column" style={{ marginLeft: '18px' }}>
                            <div className="item-label-group">
                                <span className="item-label">{t('persistent_limit')}</span>
                                <span className="hint">{t('persistent_limit_hint')}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                                <input type="number" min={50} max={99999} value={persistentLimit}
                                    onChange={(e) => { const v = Number(e.target.value); if (v >= 50 && v <= 99999) { setPersistentLimit(v); } }}
                                    onBlur={() => { const v = Math.max(50, Math.min(99999, persistentLimit || 5000)); setPersistentLimit(v); saveAppSetting('persistent_limit', String(v)); }}
                                    style={{ width: '100%', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-element)', color: 'var(--text-primary)' }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="setting-item">
                        <div className="item-label-group">
                            <span className="item-label">{t('merge_duplicates')}</span>
                            <span className="hint">{t('merge_duplicates_hint')}</span>
                        </div>
                        <label className="switch">
                            <input className="cb" type="checkbox" checked={deduplicate} onChange={(e) => { const val = e.target.checked; setDeduplicate(val); invoke("set_deduplication", { enabled: val }).catch(console.error); }} />
                            <div className="toggle"><div className="left" /><div className="right" /></div>
                        </label>
                    </div>

                    <div className="setting-item">
                        <div className="item-label-group">
                            <span className="item-label">{t('capture_images')}</span>
                            <span className="hint">{t('capture_images_hint')}</span>
                        </div>
                        <label className="switch">
                            <input className="cb" type="checkbox" checked={captureImages} onChange={(e) => { const val = e.target.checked; setCaptureImages(val); invoke("set_capture_files", { enabled: val }).catch(console.error); }} />
                            <div className="toggle"><div className="left" /><div className="right" /></div>
                        </label>
                    </div>

                    <div className="setting-item">
                        <div className="item-label-group">
                            <span className="item-label">{t('delete_after_paste')}</span>
                            <span className="hint">{t('delete_after_paste_hint')}</span>
                        </div>
                        <label className="switch">
                            <input className="cb" type="checkbox" checked={deleteAfterPaste} onChange={(e) => { const val = e.target.checked; setDeleteAfterPaste(val); invoke("set_delete_after_paste", { enabled: val }).catch(console.error); }} />
                            <div className="toggle"><div className="left" /><div className="right" /></div>
                        </label>
                    </div>

                    <div className="setting-item">
                        <div className="item-label-group">
                            <span className="item-label">{t('move_to_top_after_paste')}</span>
                            <span className="hint">{t('move_to_top_after_paste_hint')}</span>
                        </div>
                        <label className="switch">
                            <input className="cb" type="checkbox" checked={moveToTopAfterPaste} onChange={(e) => { const val = e.target.checked; setMoveToTopAfterPaste(val); saveAppSetting('move_to_top_after_paste', String(val)); }} />
                            <div className="toggle"><div className="left" /><div className="right" /></div>
                        </label>
                    </div>

                    {/* Sequential Paste */}
                    <div className="setting-item">
                        <LabelWithHint label={t('sequential_paste_mode')} hint={t('sequential_paste_hint').replace('{hotkey}', sequentialHotkey || t('not_set'))} hintKey="sequential_mode" />
                        <label className="switch">
                            <input className="cb" type="checkbox" checked={sequentialMode} onChange={(e) => { const val = e.target.checked; setSequentialModeState(val); invoke("set_sequential_mode", { enabled: val }).catch(console.error); }} />
                            <div className="toggle"><div className="left" /><div className="right" /></div>
                        </label>
                    </div>
                    {sequentialMode && (
                        <div className="setting-item" style={{ marginLeft: '18px' }}>
                            <div className="item-label-group"><span className="item-label">{t('sequential_paste_hotkey_label')}</span></div>
                            <div className="hotkey-recorder" style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: '8px', background: isRecordingSequential ? 'var(--accent-color)' : 'var(--bg-element)', color: isRecordingSequential ? '#fff' : 'var(--text-primary)', fontSize: '13px' }}
                                onClick={() => { if (!isRecordingSequential) { invoke("set_recording_mode", { enabled: true }).catch(console.error); setIsRecordingSequential(true); } }}>
                                {isRecordingSequential ? t('waiting_for_input') : getHotkeyDisplayTokens(sequentialHotkey).map(t => t.label).join(' + ') || t('not_set')}
                            </div>
                        </div>
                    )}

                    {/* Rich Paste Hotkey */}
                    <div className="setting-item">
                        <div className="item-label-group"><span className="item-label">{t('rich_paste_hotkey_label')}</span></div>
                        <div className="hotkey-recorder" style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: '8px', background: isRecordingRich ? 'var(--accent-color)' : 'var(--bg-element)', color: isRecordingRich ? '#fff' : 'var(--text-primary)', fontSize: '13px' }}
                            onClick={() => { if (!isRecordingRich) { invoke("set_recording_mode", { enabled: true }).catch(console.error); setIsRecordingRich(true); } }}>
                            {isRecordingRich ? t('waiting_for_input') : getHotkeyDisplayTokens(richPasteHotkey).map(t => t.label).join(' + ') || t('not_set')}
                        </div>
                    </div>

                    {/* Search Hotkey */}
                    <div className="setting-item">
                        <div className="item-label-group"><span className="item-label">{t('search_hotkey_label')}</span></div>
                        <div className="hotkey-recorder" style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: '8px', background: isRecordingSearch ? 'var(--accent-color)' : 'var(--bg-element)', color: isRecordingSearch ? '#fff' : 'var(--text-primary)', fontSize: '13px' }}
                            onClick={() => { if (!isRecordingSearch) { invoke("set_recording_mode", { enabled: true }).catch(console.error); setIsRecordingSearch(true); } }}>
                            {isRecordingSearch ? t('waiting_for_input') : getHotkeyDisplayTokens(searchHotkey).map(t => t.label).join(' + ') || t('not_set')}
                        </div>
                    </div>

                    {/* Quick Paste Modifier */}
                    <div className="setting-item">
                        <LabelWithHint label={t('quick_paste_modifier')} hint={t('quick_paste_modifier_hint')} hintKey="quick_paste" />
                        <div style={{ position: 'relative' }}>
                            <button className="select-trigger" onClick={() => setQuickPasteOpen(!quickPasteOpen)}
                                style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-element)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px' }}>
                                {quickPasteModifier === 'disabled' ? t('quick_paste_modifier_disabled') : modifierLabels[quickPasteModifier]} ▾
                            </button>
                            {quickPasteOpen && (
                                <div style={{ position: 'absolute', zIndex: 100, top: '100%', left: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', minWidth: '100px' }}>
                                    {(['disabled', 'ctrl', 'alt', 'shift', 'win'] as const).map(mod => (
                                        <div key={mod} onClick={() => { setQuickPasteModifier(mod); setQuickPasteOpen(false); saveAppSetting('quick_paste_modifier', mod); }}
                                            style={{ padding: '6px 12px', cursor: 'pointer', background: quickPasteModifier === mod ? 'var(--accent-color)' : 'transparent', color: quickPasteModifier === mod ? '#fff' : 'var(--text-primary)', fontSize: '13px' }}>
                                            {mod === 'disabled' ? t('quick_paste_modifier_disabled') : modifierLabels[mod]}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Global Hotkey */}
                    <div className="setting-item">
                        <LabelWithHint label={t('global_hotkey')} hint={t('hotkey_recording_hint')} hintKey="global_hotkey" />
                        <div className="hotkey-recorder" style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: '8px', background: isRecording ? 'var(--accent-color)' : 'var(--bg-element)', color: isRecording ? '#fff' : 'var(--text-primary)', fontSize: '13px' }}
                            onClick={() => { if (!isRecording) { invoke("set_recording_mode", { enabled: true }).catch(console.error); setIsRecording(true); } }}>
                            {isRecording ? t('waiting_for_input') : getHotkeyDisplayTokens(hotkey).map(t => t.label).join(' + ') || t('not_set')}
                        </div>
                    </div>
                    {!isMac && (
                        <div style={{ padding: '8px 12px', fontSize: '11px', color: '#e67e22', fontWeight: 600 }}>{t('win_key_not_recommended')}</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ClipboardSettingsGroup;
