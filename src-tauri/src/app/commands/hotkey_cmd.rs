use crate::app_state::SettingsState;
use crate::error::{AppError, AppResult};
use crate::global_state::HOTKEY_STRING;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

fn register_shortcut(app_handle: &AppHandle, hotkey: &str) {
    if hotkey.is_empty()
        || !hotkey.contains('+') // bare single key: bad global hotkey, skip
        || hotkey.eq_ignore_ascii_case("MouseMiddle")
        || hotkey.eq_ignore_ascii_case("MButton")
    {
        return;
    }

    let normalized = hotkey.replace("Win", "Super");
    if let Ok(shortcut) = normalized.parse::<Shortcut>() {
        if let Err(e) = app_handle.global_shortcut().register(shortcut) {
            eprintln!("[hotkey] register failed for '{hotkey}': {e:?}");
        }
    } else {
        eprintln!("[hotkey] unparseable hotkey '{hotkey}'");
    }
}

/// Win+key combinations Windows reserves for itself. **Advisory only** — used
/// to enrich the register-failure message. It must NOT hard-reject combos like
/// Win+V: the app ships a "use Win+V as global hotkey" feature that disables
/// the system clipboard history, freeing Win+V. Whether a combo actually works
/// is decided by RegisterHotKey's real result, not by this list.
fn is_system_reserved_win_combo(hotkey: &str) -> bool {
    let parts: Vec<String> = hotkey
        .split('+')
        .map(|s| s.trim().to_uppercase())
        .collect();
    let has_win = parts.iter().any(|p| p == "WIN" || p == "SUPER");
    if !has_win {
        return false;
    }

    let has_shift = parts.iter().any(|p| p == "SHIFT");
    let has_ctrl = parts.iter().any(|p| p == "CTRL" || p == "CONTROL");
    let has_alt = parts.iter().any(|p| p == "ALT" || p == "OPTION");

    let main = parts
        .iter()
        .rev()
        .find(|p| {
            !matches!(
                p.as_str(),
                "WIN" | "SUPER" | "SHIFT" | "CTRL" | "CONTROL" | "ALT" | "OPTION"
            )
        })
        .map(|s| s.as_str())
        .unwrap_or("");

    let is_digit = main.len() == 1 && matches!(main.chars().next(), Some(c) if ('0'..='9').contains(&c));

    if !has_shift && !has_ctrl && !has_alt {
        // Shell-owned combos that definitely never fire (locked-in by the OS).
        return is_digit
            || matches!(
                main,
                "A" | "B" | "C" | "D" | "E" | "G" | "H" | "I" | "K" | "L" | "M" | "N" | "P"
                    | "Q" | "R" | "S" | "T" | "U" | "W" | "X" | "Z"
                    | "SPACE" | "TAB" | "ENTER" | "ESC" | "PRINTSCREEN" | "PERIOD" | "SEMICOLON"
                    | "COMMA"
            );
    }

    // With an extra modifier only a handful of combos are truly reserved.
    (has_shift && main == "S")        // Win+Shift+S screenshot
        || (has_shift && main == "M") // Win+Shift+M restore minimized windows
        || (has_ctrl && main == "D")  // Win+Ctrl+D new virtual desktop
        || (has_alt && main == "D")   // Win+Alt+D date & time flyout
        || (has_ctrl && has_shift && main == "B") // Win+Ctrl+Shift+B restart GPU driver
}

pub(crate) fn sync_registered_hotkeys(app_handle: &AppHandle) -> AppResult<()> {
    let _ = app_handle.global_shortcut().unregister_all();

    let Some(settings) = app_handle.try_state::<SettingsState>() else {
        return Ok(());
    };

    let main_hotkey = settings.main_hotkey.lock().unwrap().clone();
    register_shortcut(app_handle, &main_hotkey);

    let sequential_mode = settings.sequential_mode.load(Ordering::Relaxed);
    let sequential_hotkey = settings.sequential_paste_hotkey.lock().unwrap().clone();
    if sequential_mode {
        register_shortcut(app_handle, &sequential_hotkey);
    }

    let rich_hotkey = settings.rich_paste_hotkey.lock().unwrap().clone();
    register_shortcut(app_handle, &rich_hotkey);

    let search_hotkey = settings.search_hotkey.lock().unwrap().clone();
    register_shortcut(app_handle, &search_hotkey);

    Ok(())
}

#[tauri::command]
pub fn register_hotkey(app_handle: AppHandle, hotkey: String) -> AppResult<()> {
    {
        let mut guard = HOTKEY_STRING.lock().unwrap();
        *guard = hotkey.clone();
    }

    if let Some(settings) = app_handle.try_state::<SettingsState>() {
        let mut guard = settings.main_hotkey.lock().unwrap();
        *guard = hotkey.clone();
    }

    sync_registered_hotkeys(&app_handle)
}

#[tauri::command]
pub fn test_hotkey_available(app_handle: AppHandle, hotkey: String) -> AppResult<bool> {
    if hotkey.is_empty()
        || hotkey.eq_ignore_ascii_case("MouseMiddle")
        || hotkey.eq_ignore_ascii_case("MButton")
    {
        return Ok(true);
    }

    // A bare single key (no modifier) makes a terrible global hotkey — it would
    // swallow every press of that key system-wide and almost always collides.
    // Reject it with a clear message instead of the misleading "already in use".
    if !hotkey.contains('+') {
        return Err(AppError::Internal(
            "请使用含修饰键的组合（如 Ctrl+Alt+K、Win+V）".to_string(),
        ));
    }

    // Note: no hard rejection of Win combos here. Whether a combo works is
    // decided by RegisterHotKey below — e.g. Win+V succeeds once the system
    // clipboard history is disabled (the app's use_win_v_shortcut feature).

    let normalized = hotkey.replace("Win", "Super");
    let shortcut = normalized
        .parse::<Shortcut>()
        .map_err(|_| AppError::Validation("快捷键格式无效".to_string()))?;

    match app_handle.global_shortcut().register(shortcut.clone()) {
        Ok(_) => {
            let _ = app_handle.global_shortcut().unregister(shortcut);
            Ok(true)
        }
        Err(e) => {
            let err_str = format!("{:?}", e);
            // Surface the real OS error to the dev log so "快捷键不可用"
            // (register failed with a non-AlreadyRegistered error) can be
            // diagnosed instead of guessed at.
            eprintln!(
                "[hotkey] test_hotkey_available('{hotkey}') register failed: {err_str}"
            );
            let already = is_already_registered_error(&err_str);

            // AlreadyRegistered may be OUR OWN stale registration (e.g. the main
            // hotkey was registered at startup and recording mode's unregister_all
            // missed it because it lives in a different manager state). Unregister
            // it and probe once more — a real foreign/system reservation will
            // still fail the retry and fall through to the occupied message.
            if already {
                let _ = app_handle.global_shortcut().unregister(shortcut.clone());
                if app_handle.global_shortcut().register(shortcut.clone()).is_ok() {
                    let _ = app_handle.global_shortcut().unregister(shortcut);
                    eprintln!(
                        "[hotkey] test_hotkey_available('{hotkey}') OK after unregister-retry"
                    );
                    return Ok(true);
                }
            }

            let mut user_msg = if already {
                "该快捷键已被其他程序或系统占用".to_string()
            } else {
                "快捷键不可用".to_string()
            };
            // Advisory hint for combos the shell owns. Win+V is special: the
            // system clipboard history owns it unless disabled (the app's
            // use_win_v_shortcut feature rewrites EnableClipboardHistory).
            if hotkey.eq_ignore_ascii_case("Win+V") || hotkey.eq_ignore_ascii_case("Super+V") {
                user_msg = format!(
                    "{user_msg}；Win+V 被系统剪贴板历史占用，请先在设置中开启「使用 Win+V 快捷键」（会自动关闭系统剪贴板历史）"
                );
            } else if is_system_reserved_win_combo(&hotkey) {
                user_msg = format!(
                    "{user_msg}；Win+字母多数被 Windows 系统保留，建议改用 Win+Alt / Win+Ctrl / Win+Shift 组合"
                );
            }
            Err(AppError::Internal(user_msg))
        }
    }
}

/// True when a plugin/OS error string denotes "hotkey already registered".
/// global-hotkey renders it as "HotKey already registered: ..." (lowercase in
/// the Display text) while the Rust variant Debug name is `AlreadyRegistered` —
/// match both case-insensitively.
fn is_already_registered_error(err_str: &str) -> bool {
    let lower = err_str.to_lowercase();
    lower.contains("already registered") || lower.contains("alreadyregistered")
}

#[cfg(test)]
mod tests {
    use super::{is_already_registered_error, is_system_reserved_win_combo};

    #[test]
    fn already_registered_detection_case_insensitive() {
        // Real-world render from global-hotkey (lowercase) — this exact string
        // previously failed to match and was misreported as "快捷键不可用".
        assert!(is_already_registered_error(
            "GlobalHotkey(\"HotKey already registered: HotKey { mods: Modifiers(SUPER), key: KeyV, id: 536870952 }\")"
        ));
        // Rust variant Debug name (capitalized).
        assert!(is_already_registered_error(
            "GlobalHotkey(AlreadyRegistered(HotKey { mods: Modifiers(0x0), key: KeyS, id: 37 }))"
        ));
        // Other OS errors must NOT be treated as occupied.
        assert!(!is_already_registered_error(
            "GlobalHotkey(OsError { code: 1400, message: \"invalid window handle\" })"
        ));
        assert!(!is_already_registered_error(""));
    }

    #[test]
    fn plain_win_letter_is_reserved() {
        assert!(is_system_reserved_win_combo("Win+Q"));
        assert!(is_system_reserved_win_combo("Win+L"));
        assert!(is_system_reserved_win_combo("Win+1"));
        assert!(is_system_reserved_win_combo("Win+Space"));
    }

    #[test]
    fn win_with_extra_modifier_is_allowed() {
        assert!(!is_system_reserved_win_combo("Win+Alt+Q"));
        assert!(!is_system_reserved_win_combo("Win+Ctrl+Q"));
        assert!(!is_system_reserved_win_combo("Win+Shift+Q"));
        assert!(!is_system_reserved_win_combo("Win+F2"));
    }

    #[test]
    fn win_letter_inert_on_desktop_is_allowed() {
        // Win+O (orientation lock) only exists on tablets; F/J/Y are inert.
        assert!(!is_system_reserved_win_combo("Win+O"));
        assert!(!is_system_reserved_win_combo("Win+F"));
        assert!(!is_system_reserved_win_combo("Win+J"));
        assert!(!is_system_reserved_win_combo("Win+Y"));
    }

    #[test]
    fn shell_owned_modified_combos_are_reserved() {
        assert!(is_system_reserved_win_combo("Win+Shift+S"));
        assert!(is_system_reserved_win_combo("Win+Ctrl+D"));
        assert!(is_system_reserved_win_combo("Win+Alt+D"));
        assert!(is_system_reserved_win_combo("Win+Ctrl+Shift+B"));
    }

    #[test]
    fn non_win_hotkeys_never_reserved() {
        assert!(!is_system_reserved_win_combo("Ctrl+Alt+Q"));
        assert!(!is_system_reserved_win_combo("Super+Ctrl+P"));
    }
}
