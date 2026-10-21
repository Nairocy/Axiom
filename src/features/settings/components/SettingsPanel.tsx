// @ts-nocheck

import { memo, useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { HelpCircle, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import type { Locale } from "../../../shared/types";
import type { DefaultAppsMap, InstalledAppOption, SettingsSubpage } from "../../app/types";
import type { AppCleanupPolicy } from "../types";
import GeneralSettingsGroup from "./groups/GeneralSettingsGroup";
import ClipboardSettingsGroup from "./groups/ClipboardSettingsGroup";
import AppearanceSettingsGroup from "./groups/AppearanceSettingsGroup";
import FileTransferSettingsGroup from "./groups/FileTransferSettingsGroup";
import DefaultAppsSettingsGroup from "./groups/DefaultAppsSettingsGroup";
import DataSettingsGroup from "./groups/DataSettingsGroup";
import AdvancedSettingsGroup from "./groups/AdvancedSettingsGroup";
import AppSelectorModal from "./AppSelectorModal";
import ThemeStorePanel from "../../theme-store/components/ThemeStorePanel";
import SettingsFooter from "./SettingsFooter";

interface SettingsPanelProps {
    t: (key: string) => string;
    theme: string;
    language: Locale;
    colorMode: string;
    showSourceAppIcon: boolean;
    setShowSourceAppIcon: (val: boolean) => void;
    clipboardItemFontSize: number;
    setClipboardItemFontSize: (val: number) => void;
    clipboardTagFontSize: number;
    setClipboardTagFontSize: (val: number) => void;

    collapsedGroups: Record<string, boolean>;
    settingsSubpage: SettingsSubpage;
    autoStart: boolean;
    silentStart: boolean;
    persistent: boolean;
    persistentLimitEnabled: boolean;
    persistentLimit: number;
    deduplicate: boolean;
    captureImages: boolean;
        deleteAfterPaste: boolean;
    moveToTopAfterPaste: boolean;
    sequentialMode: boolean;
    sequentialHotkey: string;
    isRecordingSequential: boolean;
    richPasteHotkey: string;
    isRecordingRich: boolean;
    searchHotkey: string;
    isRecordingSearch: boolean;
    quickPasteModifier: "disabled" | "ctrl" | "alt" | "shift" | "win";
    setQuickPasteModifier: (val: "disabled" | "ctrl" | "alt" | "shift" | "win") => void;
                          cleanupRules: string;
    setCleanupRules: (val: string) => void;
    appCleanupPolicies: AppCleanupPolicy[];
    setAppCleanupPolicies: (val: AppCleanupPolicy[]) => void;
    hotkey: string;
    showHotkeyHint: boolean;
    showSearchBox: boolean;
    setShowSearchBox: (val: boolean) => void;
    scrollTopButtonEnabled: boolean;
    setScrollTopButtonEnabled: (val: boolean) => void;
    emojiPanelEnabled: boolean;
    setEmojiPanelEnabled: (val: boolean) => void;
    tagManagerEnabled: boolean;
    setTagManagerEnabled: (val: boolean) => void;
    arrowKeySelection: boolean;
    setArrowKeySelection: (val: boolean) => void;

    soundEnabled: boolean;
    setSoundEnabled: (val: boolean) => void;
    pasteSoundEnabled: boolean;
    setPasteSoundEnabled: (val: boolean) => void;
    soundVolume: number;
    setSoundVolume: (val: number) => void;
    hideTrayIcon: boolean;
    setHideTrayIcon: (val: boolean) => void;
    hideDockIcon: boolean;
    setHideDockIcon: (val: boolean) => void;
    edgeDocking: boolean;
    setEdgeDocking: (val: boolean) => void;
    customBackground: string;
    setCustomBackground: (val: string) => void;
    customBackgroundOpacity: number;
    setCustomBackgroundOpacity: (val: number) => void;
    surfaceOpacity: number;
    setSurfaceOpacity: (val: number) => void;

    fileServerEnabled: boolean;
    fileServerPort: string;
    localIp: string;
    availableIps?: string[];
    setLocalIp?: (val: string) => void;
    actualPort: string;
    fileTransferAutoOpen: boolean;
    showAutoCloseHint: boolean;
    fileServerAutoClose: boolean;
    fileTransferAutoCopy: boolean;
    fileTransferPath: string;

    installedApps: InstalledAppOption[];
    appSettings: Record<string, string>;
    defaultApps: DefaultAppsMap;
    showAppSelector: string | null;
    dataPath: string;

    toggleGroup: (group: string) => void;
    setSettingsSubpage: (val: SettingsSubpage) => void;
    setAutoStart: (val: boolean) => void;
    setSilentStart: (val: boolean) => void;
    setPersistent: (val: boolean) => void;
    setPersistentLimitEnabled: (val: boolean) => void;
    setPersistentLimit: (val: number) => void;
    setDeduplicate: (val: boolean) => void;
    setCaptureImages: (val: boolean) => void;
        setDeleteAfterPaste: (val: boolean) => void;
    setMoveToTopAfterPaste: (val: boolean) => void;
    saveAppSetting: (key: string, val: string) => void;
    setSequentialModeState: (val: boolean) => void;
    setIsRecordingSequential: (val: boolean) => void;
    updateSequentialHotkey: (key: string) => void;
    setIsRecordingRich: (val: boolean) => void;
    updateRichPasteHotkey: (key: string) => void;
    setIsRecordingSearch: (val: boolean) => void;
    updateSearchHotkey: (key: string) => void;
      setShowHotkeyHint: (val: boolean) => void;
    setIsRecording: (val: boolean) => void;
    isRecording: boolean;
    hotkeyParts: string[];
    updateHotkey: (key: string) => void;

    setTheme: (val: string) => void;
    setColorMode: (val: string) => void;
    setLanguage: (val: Locale) => void;

    compactMode: boolean;
    setCompactMode: (val: boolean) => void;
    checkHotkeyConflict: (newHotkey: string, mode: 'main' | 'sequential' | 'rich' | 'search') => boolean;

    setFileServerEnabled: (val: boolean) => void;
    setFileServerPort: (val: string) => void;
    setFileTransferAutoOpen: (val: boolean) => void;
    setShowAutoCloseHint: (val: boolean) => void;
    setFileServerAutoClose: (val: boolean) => void;
    setFileTransferAutoCopy: (val: boolean) => void;
    fetchEffectiveTransferPath: () => void;

    setShowAppSelector: (val: string | null) => void;
    installedApps: InstalledAppOption[];
    appSettings: Record<string, string>;
    defaultApps: DefaultAppsMap;
    showAppSelector: string | null;
    dataPath: string;
    setShowAppSelector: (val: string | null) => void;
    onOpenChat?: () => void;

    saveSetting: (key: string, val: string) => void;
}

const SettingsPanel = (props: SettingsPanelProps) => {
    const {
        t, theme, language, colorMode, showSourceAppIcon, setShowSourceAppIcon,
        collapsedGroups, settingsSubpage, autoStart, silentStart, persistent, persistentLimitEnabled, persistentLimit, deduplicate, captureImages, deleteAfterPaste, moveToTopAfterPaste,
        sequentialMode, sequentialHotkey, isRecordingSequential,
        richPasteHotkey, isRecordingRich, searchHotkey, isRecordingSearch, quickPasteModifier, setQuickPasteModifier,
        cleanupRules, setCleanupRules, appCleanupPolicies, setAppCleanupPolicies, showSearchBox, setShowSearchBox, scrollTopButtonEnabled, setScrollTopButtonEnabled, arrowKeySelection, setArrowKeySelection,
        soundEnabled, setSoundEnabled, pasteSoundEnabled, setPasteSoundEnabled,
        soundVolume, setSoundVolume,
        hideTrayIcon, setHideTrayIcon,
        hideDockIcon, setHideDockIcon,
        edgeDocking, setEdgeDocking,
        customBackground, setCustomBackground,
        customBackgroundOpacity, setCustomBackgroundOpacity,
        surfaceOpacity, setSurfaceOpacity,
        fileServerEnabled, fileServerPort, localIp, availableIps, setLocalIp, actualPort, fileTransferAutoOpen, showAutoCloseHint, fileServerAutoClose, fileTransferAutoCopy, fileTransferPath, installedApps, appSettings, defaultApps, showAppSelector, dataPath,

        toggleGroup, setSettingsSubpage, setAutoStart, setSilentStart, setPersistent, setPersistentLimitEnabled, setPersistentLimit, setDeduplicate, setCaptureImages, setDeleteAfterPaste, setMoveToTopAfterPaste, saveAppSetting,
        setSequentialModeState, setIsRecordingSequential, updateSequentialHotkey,
        setIsRecordingRich, updateRichPasteHotkey,
        setIsRecordingSearch, updateSearchHotkey,
            setIsRecording, isRecording, hotkey, hotkeyParts, updateHotkey,
        setTheme, setColorMode, setLanguage, compactMode, setCompactMode, checkHotkeyConflict,
        clipboardItemFontSize, setClipboardItemFontSize, clipboardTagFontSize, setClipboardTagFontSize,
        emojiPanelEnabled, setEmojiPanelEnabled, tagManagerEnabled, setTagManagerEnabled,
        setFileServerEnabled, setFileServerPort, setFileTransferAutoOpen, setShowAutoCloseHint, setFileServerAutoClose, setFileTransferAutoCopy, fetchEffectiveTransferPath, setShowAppSelector,        saveSetting,
        onOpenChat,
    } = props;

    const [appVersion, setAppVersion] = useState("");
    const [openHints, setOpenHints] = useState<Set<string>>(new Set());

    const applyFileServerPort = async (portStr: string) => {
        const port = Number(portStr);
        if (!Number.isInteger(port) || port < 1 || port > 65535) return;
        if (!fileServerEnabled) return;
        try {
            await invoke("toggle_file_server", { enabled: false });
            await invoke("toggle_file_server", { enabled: true, port });
        } catch (e) {
            console.error(e);
        }
    };

    const toggleHint = (key: string) => {
        setOpenHints(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const LabelWithHint = ({ label, hint, hintKey }: { label: string; hint?: string | React.ReactNode; hintKey: string }) => (
        <div className="item-label-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="item-label">{label}</span>
                {hint && (
                    <button
                        type="button"
                        className="hint-icon-btn"
                        title={typeof hint === 'string' ? hint : undefined}
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleHint(hintKey);
                        }}
                    >
                        <HelpCircle size={12} />
                    </button>
                )}
            </div>
            {hint && openHints.has(hintKey) && (
                typeof hint === 'string' ? <span className="hint">{hint}</span> : hint
            )}
        </div>
    );

    useEffect(() => {
        getVersion()
            .then(v => setAppVersion(v))
            .catch(err => {
                console.error("Failed to get version:", err);
                setAppVersion("0.2.0");
            });
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '100%', flex: 1 }}
        >
            {settingsSubpage === "advanced" ? (
                <>
                    <AdvancedSettingsGroup
                        t={t}
                        cleanupRules={cleanupRules}
                        setCleanupRules={setCleanupRules}
                        appCleanupPolicies={appCleanupPolicies}
                        setAppCleanupPolicies={setAppCleanupPolicies}
                        installedApps={installedApps}
                    />

                    <AppSelectorModal
                        show={showAppSelector}
                        installedApps={installedApps}
                        theme={theme}
                        colorMode={colorMode}
                        t={t}
                        onClose={() => setShowAppSelector(null)}
                        onSave={saveAppSetting}
                    />
                </>
            ) : (
                <>
            {/* General Settings */}
            <GeneralSettingsGroup
                t={t}
                collapsed={collapsedGroups['general']}
                onToggle={() => toggleGroup('general')}
                LabelWithHint={LabelWithHint}
                autoStart={autoStart}
                setAutoStart={setAutoStart}
                silentStart={silentStart}
                setSilentStart={setSilentStart}
                hideTrayIcon={hideTrayIcon}
                setHideTrayIcon={setHideTrayIcon}
                hideDockIcon={hideDockIcon}
                setHideDockIcon={setHideDockIcon}
                edgeDocking={edgeDocking}
                setEdgeDocking={setEdgeDocking}
                soundEnabled={soundEnabled}
                setSoundEnabled={setSoundEnabled}
                pasteSoundEnabled={pasteSoundEnabled}
                setPasteSoundEnabled={setPasteSoundEnabled}
                soundVolume={soundVolume}
                setSoundVolume={setSoundVolume}
                showSearchBox={showSearchBox}
                setShowSearchBox={setShowSearchBox}
                scrollTopButtonEnabled={scrollTopButtonEnabled}
                setScrollTopButtonEnabled={setScrollTopButtonEnabled}
                emojiPanelEnabled={emojiPanelEnabled}
                setEmojiPanelEnabled={setEmojiPanelEnabled}
                tagManagerEnabled={tagManagerEnabled}
                setTagManagerEnabled={setTagManagerEnabled}
                arrowKeySelection={arrowKeySelection}
                setArrowKeySelection={setArrowKeySelection}
                saveAppSetting={saveAppSetting}
            />

            {/* Clipboard Settings */}
            <ClipboardSettingsGroup
                t={t}
                collapsed={collapsedGroups['clipboard']}
                onToggle={() => toggleGroup('clipboard')}
                LabelWithHint={LabelWithHint}
                persistent={persistent}
                setPersistent={setPersistent}
                persistentLimitEnabled={persistentLimitEnabled}
                setPersistentLimitEnabled={setPersistentLimitEnabled}
                persistentLimit={persistentLimit}
                setPersistentLimit={setPersistentLimit}
                saveAppSetting={saveAppSetting}
                deduplicate={deduplicate}
                setDeduplicate={setDeduplicate}
                captureImages={captureImages}
                setCaptureImages={setCaptureImages}
                richPasteHotkey={richPasteHotkey}
                isRecordingRich={isRecordingRich}
                setIsRecordingRich={setIsRecordingRich}
                updateRichPasteHotkey={updateRichPasteHotkey}
                searchHotkey={searchHotkey}
                isRecordingSearch={isRecordingSearch}
                setIsRecordingSearch={setIsRecordingSearch}
                updateSearchHotkey={updateSearchHotkey}
                quickPasteModifier={quickPasteModifier}
                setQuickPasteModifier={setQuickPasteModifier}
                deleteAfterPaste={deleteAfterPaste}
                setDeleteAfterPaste={setDeleteAfterPaste}
                moveToTopAfterPaste={moveToTopAfterPaste}
                setMoveToTopAfterPaste={setMoveToTopAfterPaste}
                sequentialMode={sequentialMode}
                setSequentialModeState={setSequentialModeState}
                sequentialHotkey={sequentialHotkey}
                isRecordingSequential={isRecordingSequential}
                setIsRecordingSequential={setIsRecordingSequential}
                updateSequentialHotkey={updateSequentialHotkey}
                checkHotkeyConflict={checkHotkeyConflict}


                isRecording={isRecording}
                setIsRecording={setIsRecording}
                hotkeyParts={hotkeyParts}
                updateHotkey={updateHotkey}
                hotkey={hotkey}
                appSettings={appSettings}
                theme={theme}
                colorMode={colorMode}
            />

            {/* Appearance Settings */}
            <AppearanceSettingsGroup
                t={t}
                collapsed={collapsedGroups['appearance']}
                onToggle={() => toggleGroup('appearance')}
                LabelWithHint={LabelWithHint}
                theme={theme}
                setTheme={setTheme}
                colorMode={colorMode}
                setColorMode={setColorMode}
                language={language}
                setLanguage={setLanguage}
                showSourceAppIcon={showSourceAppIcon}
                setShowSourceAppIcon={setShowSourceAppIcon}
                compactMode={compactMode}
                setCompactMode={setCompactMode}
                clipboardItemFontSize={clipboardItemFontSize}
                setClipboardItemFontSize={setClipboardItemFontSize}
                clipboardTagFontSize={clipboardTagFontSize}
                setClipboardTagFontSize={setClipboardTagFontSize}
                customBackground={customBackground}
                setCustomBackground={setCustomBackground}
                customBackgroundOpacity={customBackgroundOpacity}
                setCustomBackgroundOpacity={setCustomBackgroundOpacity}
                surfaceOpacity={surfaceOpacity}
                setSurfaceOpacity={setSurfaceOpacity}
                saveAppSetting={saveAppSetting}
                setSettingsSubpage={setSettingsSubpage}
            />

            {/* File Transfer Settings */}
            <FileTransferSettingsGroup
                t={t}
                collapsed={collapsedGroups['file_transfer']}
                onToggle={() => toggleGroup('file_transfer')}
                fileServerEnabled={fileServerEnabled}
                setFileServerEnabled={setFileServerEnabled}
                fileServerPort={fileServerPort}
                setFileServerPort={setFileServerPort}
                applyFileServerPort={applyFileServerPort}
                localIp={localIp}
                availableIps={availableIps}
                setLocalIp={setLocalIp}
                actualPort={actualPort}
                fileTransferAutoOpen={fileTransferAutoOpen}
                setFileTransferAutoOpen={setFileTransferAutoOpen}
                showAutoCloseHint={showAutoCloseHint}
                setShowAutoCloseHint={setShowAutoCloseHint}
                fileServerAutoClose={fileServerAutoClose}
                setFileServerAutoClose={setFileServerAutoClose}
                fileTransferAutoCopy={fileTransferAutoCopy}
                setFileTransferAutoCopy={setFileTransferAutoCopy}
                onOpenChat={onOpenChat}
                fileTransferPath={fileTransferPath}
                saveSetting={saveSetting}
                fetchEffectiveTransferPath={fetchEffectiveTransferPath}
            />

            {/* Data Management Settings */}
            <DataSettingsGroup
                t={t}
                collapsed={collapsedGroups['data']}
                onToggle={() => toggleGroup('data')}
                dataPath={dataPath}
            />

            <AppSelectorModal
                show={showAppSelector}
                installedApps={installedApps}
                theme={theme}
                colorMode={colorMode}
                t={t}
                onClose={() => setShowAppSelector(null)}
                onSave={saveAppSetting}
            />

            <SettingsFooter
                t={t}
                appVersion={appVersion}
            />
                </>
            )}
        </motion.div>
    );
};

export default memo(SettingsPanel);
