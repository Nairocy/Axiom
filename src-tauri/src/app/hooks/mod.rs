use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, KBDLLHOOKSTRUCT, MSLLHOOKSTRUCT, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN,
    WM_MBUTTONDOWN, WM_RBUTTONDOWN, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

use crate::app::window_manager::{hide_window_cmd, toggle_window};
use crate::app_state::SettingsState;
use crate::global_state::*;
use crate::infrastructure::windows_ext::WindowExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

// Store registered hotkey IDs for cleanup
// (the old RegisterHotKey blocking loop was removed — see set_recording_mode)

// Physical Win-key state tracked by the hook itself. The Win key's WM_SYSKEYDOWN
// must be swallowed (return 1) while recording so the Start menu never pops,
// but that also means the system never marks it as pressed — GetAsyncKeyState
// (VK_LWIN) reads 0 for the rest of the chord, so the recorded hotkey would
// lose the Win modifier (e.g. "Win+O" becomes just "O"). Track it manually.
static RECORDING_WIN_PRESSED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

// Total low-level keyboard events the hook has observed since startup.
// Incremented unconditionally at the top of keyboard_proc with NO I/O — if this
// stops growing while the user is typing, the hook thread is dead or another
// hook (e.g. WebView2/Chromium's WH_KEYBOARD_LL) is consuming events first.
static KEY_EVENT_COUNT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[cfg(target_os = "windows")]
fn quick_paste_index_from_vk(vk: u32) -> Option<usize> {
    match vk {
        0x31 | 0x61 => Some(0),
        0x32 | 0x62 => Some(1),
        0x33 | 0x63 => Some(2),
        0x34 | 0x64 => Some(3),
        0x35 | 0x65 => Some(4),
        0x36 | 0x66 => Some(5),
        0x37 | 0x67 => Some(6),
        0x38 | 0x68 => Some(7),
        0x39 | 0x69 => Some(8),
        0x30 | 0x60 => Some(9),
        _ => None,
    }
}

// Map a VK code to a human hotkey name (same mapping used by keyboard_proc's
// recording branch and by the GetAsyncKeyState polling recorder).
#[cfg(target_os = "windows")]
fn vk_to_key_name(vk: u32) -> String {
    match vk {
        0x20 => "Space".to_string(),
        0x0D => "Enter".to_string(),
        0x09 => "Tab".to_string(),
        0x08 => "Backspace".to_string(),
        0x2E => "Delete".to_string(),
        0x2D => "Insert".to_string(),
        0x21 => "PageUp".to_string(),
        0x22 => "PageDown".to_string(),
        0x23 => "End".to_string(),
        0x24 => "Home".to_string(),
        0x25 => "Left".to_string(),
        0x26 => "Up".to_string(),
        0x27 => "Right".to_string(),
        0x28 => "Down".to_string(),
        0xBB => "=".to_string(), // VK_OEM_PLUS (main-row = key); "Plus" is not parseable by global-hotkey
        0xBC => "Comma".to_string(),
        0xBD => "Minus".to_string(),
        0xBE => "Period".to_string(),
        0xBF => "/".to_string(),
        0xC0 => "`".to_string(),
        0xBA => ";".to_string(),
        0xDB => "[".to_string(),
        0xDC => "\\".to_string(),
        0xDD => "]".to_string(),
        0xDE => "'".to_string(),
        k if k >= 0x70 && k <= 0x87 => format!("F{}", k - 0x6F),
        k if (k >= 0x30 && k <= 0x39) || (k >= 0x41 && k <= 0x5A) => {
            format!("{}", char::from_u32(k).unwrap())
        }
        _ => format!("Key_{}", vk),
    }
}

// Fallback hotkey recorder that polls GetAsyncKeyState instead of relying on
// the low-level keyboard hook chain. The hook chain can be stalled system-wide
// while the WebView2 window is visible (KEY_EVENT_COUNT stays 0, key events
// only arrive after the window hides) — reinstalling our hook at the chain
// head does NOT help because the stall is not a chain-order issue. Polling the
// raw async key state bypasses the hook chain entirely, so recording always
// receives keys. The hook (when it does fire) still swallows Win to stop the
// Start menu from popping; this poller is purely additive.
#[cfg(target_os = "windows")]
fn spawn_poll_recorder(app_handle: tauri::AppHandle) {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    std::thread::spawn(move || {
        let mut prev_down = [false; 256usize];

        // Warm-up pass: record the current state of every key WITHOUT treating
        // anything as newly pressed. Otherwise a key that was already held when
        // recording started (e.g. the user is still pressing Ctrl/Shift from
        // clicking the record button) would be misread as a fresh hotkey.
        for vk in 0..256usize {
            prev_down[vk] = unsafe { (GetAsyncKeyState(vk as i32) as u16) & 0x8000 != 0 };
        }
        std::thread::sleep(std::time::Duration::from_millis(20));

        loop {
            if !IS_RECORDING.load(Ordering::SeqCst) {
                break;
            }

            // ESC cancels.
            if unsafe { (GetAsyncKeyState(0x1B) as u16) & 0x8000 != 0 } && !prev_down[0x1B] {
                if IS_RECORDING.swap(false, Ordering::SeqCst) {
                    println!("[poll] ESC cancel");
                    let _ = app_handle.emit("recording-cancelled", ());
                }
                break;
            }

            let ctrl_down = unsafe { (GetAsyncKeyState(0x11) as u16) & 0x8000 != 0 };
            let shift_down = unsafe { (GetAsyncKeyState(0x10) as u16) & 0x8000 != 0 };
            let alt_down = unsafe { (GetAsyncKeyState(0x12) as u16) & 0x8000 != 0 };
            let win_down = unsafe { (GetAsyncKeyState(0x5B) as u16) & 0x8000 != 0 }
                || unsafe { (GetAsyncKeyState(0x5C) as u16) & 0x8000 != 0 };

            // Any non-modifier key newly pressed?
            let mut found: Option<u32> = None;
            for vk in 0x08..0xFFu32 {
                let idx = vk as usize;
                if idx == 0x10 || idx == 0x11 || idx == 0x12 {
                    continue; // plain modifiers
                }
                if (0xA0..=0xA5).contains(&idx) {
                    continue; // extended modifiers (Shift/Ctrl/Alt left/right)
                }
                if idx == 0x5B || idx == 0x5C {
                    continue; // Win keys
                }
                let down = unsafe { (GetAsyncKeyState(vk as i32) as u16) & 0x8000 != 0 };
                if down && !prev_down[idx] {
                    found = Some(vk);
                    break;
                }
            }

            // Track state for next pass (keeps found detection edge-triggered).
            for vk in 0..256usize {
                prev_down[vk] =
                    unsafe { (GetAsyncKeyState(vk as i32) as u16) & 0x8000 != 0 };
            }

            if let Some(vk) = found {
                let key_name = vk_to_key_name(vk);
                if !key_name.starts_with("Key_") {
                    let final_hotkey = format!(
                        "{}{}{}{}{}",
                        if ctrl_down { "Ctrl+" } else { "" },
                        if shift_down { "Shift+" } else { "" },
                        if alt_down { "Alt+" } else { "" },
                        if win_down { "Win+" } else { "" },
                        key_name
                    );
                    // Atomic claim: only one of {hook, mouse hook, poller} may
                    // emit; whoever flips IS_RECORDING true->false wins.
                    if IS_RECORDING.swap(false, Ordering::SeqCst) {
                        println!("[poll] Recorded Hotkey: {final_hotkey}");
                        let _ = app_handle.emit("hotkey-recorded", final_hotkey);
                    }
                    break;
                }
            }

            std::thread::sleep(std::time::Duration::from_millis(15));
        }
    });
}

#[cfg(target_os = "windows")]
fn quick_paste_modifier_from_settings() -> String {
    if let Some(handle) = GLOBAL_APP_HANDLE.get() {
        let settings = handle.state::<SettingsState>();
        return settings
            .quick_paste_modifier
            .lock()
            .unwrap()
            .clone()
            .to_ascii_lowercase();
    }

    "disabled".to_string()
}

#[cfg(target_os = "windows")]
fn quick_paste_modifier_active(
    modifier: &str,
    ctrl_down: bool,
    alt_down: bool,
    shift_down: bool,
    win_down: bool,
) -> bool {
    match modifier {
        "disabled" => false,
        "ctrl" => ctrl_down && !alt_down && !shift_down && !win_down,
        "alt" => alt_down && !ctrl_down && !shift_down && !win_down,
        "shift" => shift_down && !ctrl_down && !alt_down && !win_down,
        "win" => win_down && !ctrl_down && !alt_down && !shift_down,
        _ => ctrl_down && !alt_down && !shift_down && !win_down,
    }
}

#[tauri::command]
pub fn set_recording_mode(app_handle: AppHandle, enabled: bool) -> Result<(), String> {
    println!("[hotkey] set_recording_mode -> {enabled}");
    IS_RECORDING.store(enabled, Ordering::SeqCst);
    // Fresh recording session — no modifier keys held from before.
    RECORDING_WIN_PRESSED.store(false, Ordering::SeqCst);

    // While recording, pause the app's own global shortcuts. Otherwise a Win+V
    // main hotkey (the default!) fires toggle_window the moment the user presses
    // Win+V to record it, hiding the window and making recording look dead.
    if enabled {
        let res = app_handle.global_shortcut().unregister_all();
        println!("[hotkey] unregister_all -> {res:?}");

        // Reinstall the keyboard hook at the HEAD of the low-level hook chain.
        // Low-level hook chains are LIFO: WebView2/Chromium installs its own
        // WH_KEYBOARD_LL after us at startup, so it sits ahead of our hook and
        // can stall the whole keyboard chain while its window is visible — our
        // tail hook then never sees key events and recording looks dead
        // (KEY_EVENT_COUNT stays 0, events only arrive after the window hides).
        // Uninstall + reinstall pushes our hook back to the head, ahead of
        // WebView2, so recording receives keys immediately.
        #[cfg(target_os = "windows")]
        {
            let tid = HOOK_THREAD_ID.load(Ordering::Relaxed);
            if tid != 0 {
                unsafe {
                    let _ = windows::Win32::UI::WindowsAndMessaging::PostThreadMessageW(
                        tid,
                        HOOK_REINSTALL_MSG,
                        windows::Win32::Foundation::WPARAM(0),
                        windows::Win32::Foundation::LPARAM(0),
                    );
                }
            }
        }

        // Belt-and-suspenders: poll GetAsyncKeyState on a worker thread. The
        // low-level hook chain can be stalled system-wide while the WebView2
        // window is visible (see spawn_poll_recorder docs), in which case even
        // a chain-head reinstall never sees key events. The poller bypasses
        // the hook chain entirely so recording always completes.
        #[cfg(target_os = "windows")]
        spawn_poll_recorder(app_handle.clone());

        println!(
            "[hotkey] hook KEY_EVENT_COUNT = {}",
            KEY_EVENT_COUNT.load(Ordering::Relaxed)
        );
    } else {
        let _ = crate::app::commands::sync_registered_hotkeys(&app_handle);
        println!(
            "[hotkey] hook KEY_EVENT_COUNT = {}",
            KEY_EVENT_COUNT.load(Ordering::Relaxed)
        );
    }

    // NOTE: the old RegisterHotKey "block Win+A-Z/0-9/special" loop was removed.
    // It registered Win combos on the main window's hwnd, which collides with
    // tauri-plugin-global-shortcut's own registration on its hwnd (same thread
    // => ERROR_HOTKEY_ALREADY_REGISTERED), so every Win+letter (Win+V, ...)
    // came back "already registered" even though the system had it free.
    // The low-level keyboard hook already swallows every key while recording,
    // so the Start menu can't pop anyway — the blocking loop was redundant.

    Ok(())
}

// Low-level Keyboard Hook Procedure
#[cfg(target_os = "windows")]
pub unsafe extern "system" fn keyboard_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    // Side-effect-free event counter — must run on EVERY invocation, before any
    // branch, so we can tell "hook got nothing" apart from "hook got events but
    // printing/logic failed".
    KEY_EVENT_COUNT.fetch_add(1, Ordering::Relaxed);

    let msg = w_param.0 as u32;
    let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

    if n_code >= 0 && (is_down || is_up) {
        let kbd_struct = *(l_param.0 as *const KBDLLHOOKSTRUCT);
        let vk = kbd_struct.vkCode;

        // Handle Recording Mode - Black Hole Logic
        if IS_RECORDING.load(Ordering::SeqCst) {
            println!("[hook] recv vk={vk:#04x} msg={msg:#06x}");
            let ctrl_down = GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000 != 0;
            let shift_down = GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000 != 0;
            let alt_down = GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000 != 0;
            // Win key state, dual source:
            //  1. RECORDING_WIN_PRESSED — set when our hook swallowed the Win
            //     press (Start menu must not pop). In that case the system input
            //     state never saw it, so GetAsyncKeyState reads 0.
            //  2. GetAsyncKeyState — when the Win press arrived BEFORE
            //     IS_RECORDING was set (IPC race after clicking the recorder),
            //     it was passed through, the shell processed it, and the system
            //     state reflects it. This catches the "Win+I recorded as just I"
            //     intermittent failure.
            let win_down = RECORDING_WIN_PRESSED.load(Ordering::SeqCst)
                || (GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000 != 0)
                || (GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000 != 0);

            // ESC to cancel
            if vk == 0x1B && is_down {
                // Atomic claim: only the thread that flips IS_RECORDING true->false
                // emits the cancel event (hook + poller may race).
                if IS_RECORDING.swap(false, Ordering::SeqCst) {
                    RECORDING_WIN_PRESSED.store(false, Ordering::SeqCst);
                    if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                        let _ = handle.emit("recording-cancelled", ());
                    }
                }
                return CallNextHookEx(None, n_code, w_param, l_param);
            }

            // Win key(s). 0xFF (VK__none_) is a surrogate the shell emits for a
            // Win press while the Start menu is open — real 0x5B/0x5C KEYDOWN is
            // suppressed in that state. Treat it as a Win press too.
            // KEYUP never clears the flag: the shell echoes spurious 0x5B/0x5C
            // KEYUPs around the 0xFF surrogate, and the user may press Win and
            // the letter slightly apart. The flag is cleared only when the chord
            // is committed (emit) or recording is cancelled/reset.
            let is_win = vk == 0x5B || vk == 0x5C || vk == 0xFF;
            let is_other_modifier = (vk >= 0x10 && vk <= 0x12) || (vk >= 0xA0 && vk <= 0xA5);

            if is_other_modifier {
                return CallNextHookEx(None, n_code, w_param, l_param);
            }

            // Win key: set flag on any press, swallow always to keep the Start
            // menu from popping during recording.
            if is_win {
                if vk == 0xFF {
                    // 0xFF (VK__none_) is a shell surrogate: it appears both for
                    // a real Win press while the Start menu is open (where the
                    // shell suppresses 0x5B KEYDOWN) AND as an isolated echo
                    // (e.g. the Start menu closing). Only trust it when the
                    // physical Win key is actually held — otherwise a stray
                    // 0xFF would wrongly tag the next letter as "Win+letter".
                    let phys_win = (GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000 != 0)
                        || (GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000 != 0);
                    if phys_win {
                        RECORDING_WIN_PRESSED.store(true, Ordering::SeqCst);
                    }
                } else if is_down {
                    RECORDING_WIN_PRESSED.store(true, Ordering::SeqCst);
                }
                return LRESULT(1);
            }

            if is_down {
                if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                    let key_name = vk_to_key_name(vk);

                    // Unknown/unmapped key (media/vendor keys, vk=0xFF, etc.):
                    // ignore it and keep waiting for a real key instead of
                    // emitting an unparseable hotkey that registration rejects.
                    if key_name.starts_with("Key_") {
                        println!("[hook] ignored unmapped key vk={vk:#04x}");
                        return LRESULT(1);
                    }

                    let final_hotkey = format!(
                        "{}{}{}{}{}",
                        if ctrl_down { "Ctrl+" } else { "" },
                        if shift_down { "Shift+" } else { "" },
                        if alt_down { "Alt+" } else { "" },
                        if win_down { "Win+" } else { "" },
                        key_name
                    );

                    println!("Recorded Hotkey: {}", final_hotkey);
                    // Atomic claim: only one of {hook, mouse hook, poller} may
                    // emit the recorded hotkey; the others see IS_RECORDING=false.
                    if IS_RECORDING.swap(false, Ordering::SeqCst) {
                        let _ = handle.emit("hotkey-recorded", final_hotkey);
                    }
                    RECORDING_WIN_PRESSED.store(false, Ordering::SeqCst);
                }
            }
            return LRESULT(1);
        }

        // 3. Global Paste Sound Trigger (Ctrl+V)
        {
            let ctrl_down = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
            let alt_down = (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0;
            let shift_down = (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;
            let win_down = (GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000 != 0)
                || (GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000 != 0);

            if vk == 0x56 && ctrl_down && !alt_down && !shift_down && !win_down {
                if is_down {
                    if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                        let settings = handle.state::<SettingsState>();
                        if settings.sound_enabled.load(Ordering::Relaxed) {
                            std::thread::spawn(move || {
                                let _ = handle.emit("play-sound", "paste");
                            });
                        }
                    }
                }
            }
        }

        // 4. Quick Paste by Modifier+Number
        {
            let ctrl_down = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
            let alt_down = (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0;
            let shift_down = (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;
            let win_down = (GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000 != 0)
                || (GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000 != 0);
            let quick_paste_modifier = quick_paste_modifier_from_settings();

            if is_up
                && matches!(
                    vk,
                    0x11 | 0xA2 | 0xA3 | 0x12 | 0xA4 | 0xA5 | 0x10 | 0xA0 | 0xA1 | 0x5B | 0x5C
                )
            {
                QUICK_PASTE_DIGIT_MASK.store(0, Ordering::SeqCst);
            }

            if let Some(index) = quick_paste_index_from_vk(vk) {
                let bit = 1u32 << index;

                if is_up {
                    let pressed_mask = QUICK_PASTE_DIGIT_MASK.fetch_and(!bit, Ordering::SeqCst);
                    if pressed_mask & bit != 0 {
                        return LRESULT(1);
                    }
                }

                if is_down
                    && quick_paste_modifier_active(
                        &quick_paste_modifier,
                        ctrl_down,
                        alt_down,
                        shift_down,
                        win_down,
                    )
                {
                    let pressed_mask = QUICK_PASTE_DIGIT_MASK.fetch_or(bit, Ordering::SeqCst);
                    if pressed_mask & bit != 0 {
                        return LRESULT(1);
                    }

                    if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                        let handle_clone = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(err) =
                                crate::services::clipboard_ops::paste_history_item_by_index(
                                    handle_clone,
                                    index,
                                )
                                .await
                            {
                                eprintln!(
                                    "[ERROR] Quick paste by {}+{} failed: {}",
                                    quick_paste_modifier,
                                    index + 1,
                                    err
                                );
                            }
                        });
                    }

                    return LRESULT(1);
                }
            }
        }

        // 5. Global Navigation Keys (Up/Down, Enter, Esc)
        if NAVIGATION_ENABLED.load(Ordering::SeqCst) && !IS_RECORDING.load(Ordering::SeqCst) {
            if IS_HIDDEN.load(Ordering::Relaxed) {
                return CallNextHookEx(None, n_code, w_param, l_param);
            }
            let allow_navigation = if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                let settings = handle.state::<SettingsState>();
                settings.arrow_key_selection.load(Ordering::Relaxed)
            } else {
                true
            };

            if !allow_navigation {
                return CallNextHookEx(None, n_code, w_param, l_param);
            }

            let is_navigation_key = vk == 0x26 || vk == 0x28 || vk == 0x0D || vk == 0x1B;
            let is_enter = vk == 0x0D;
            let _is_escape = vk == 0x1B;

            if is_navigation_key && is_down {
                // Only Enter requires navigation mode to be active
                // Escape can always close the window when it's visible
                if is_enter && !NAVIGATION_MODE_ACTIVE.load(Ordering::Relaxed) {
                    return CallNextHookEx(None, n_code, w_param, l_param);
                }
                let ctrl_down = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
                let alt_down = (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0;
                let win_down = (GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000 != 0)
                    || (GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000 != 0);

                if !ctrl_down && !alt_down && !win_down {
                    if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                        let action = match vk {
                            0x26 => "up",
                            0x28 => "down",
                            0x0D => "enter",
                            0x1B => "escape",
                            _ => "",
                        };

                        if !action.is_empty() {
                            if vk == 0x26 || vk == 0x28 {
                                NAVIGATION_MODE_ACTIVE.store(true, Ordering::Relaxed);
                            } else if vk == 0x1B {
                                NAVIGATION_MODE_ACTIVE.store(false, Ordering::Relaxed);
                            }
                            if action == "escape" {
                                let handle_clone = handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    let _ = handle_clone.emit("navigation-action", "escape");
                                    toggle_window(&handle_clone);
                                });
                            } else {
                                let _ = handle.emit("navigation-action", action);
                            }
                            return LRESULT(1);
                        }
                    }
                }
            }
        }
    }
    CallNextHookEx(None, n_code, w_param, l_param)
}

// Low-level Mouse Hook Procedure
#[cfg(target_os = "windows")]
pub unsafe extern "system" fn mouse_proc(n_code: i32, w_param: WPARAM, l_param: LPARAM) -> LRESULT {
    if n_code >= 0 {
        let msg = w_param.0 as u32;
        if msg == WM_MBUTTONDOWN
            || msg == WM_LBUTTONDOWN
            || msg == WM_RBUTTONDOWN
            || msg == windows::Win32::UI::WindowsAndMessaging::WM_LBUTTONUP
            || msg == windows::Win32::UI::WindowsAndMessaging::WM_RBUTTONUP
        {
            // Track mouse state globally
            if msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN {
                IS_MOUSE_BUTTON_DOWN.store(true, Ordering::SeqCst);
            } else if msg == windows::Win32::UI::WindowsAndMessaging::WM_LBUTTONUP
                || msg == windows::Win32::UI::WindowsAndMessaging::WM_RBUTTONUP
            {
                IS_MOUSE_BUTTON_DOWN.store(false, Ordering::SeqCst);
                return CallNextHookEx(None, n_code, w_param, l_param); // Return early for up events
            }

            // Handle Recording Mode
            if IS_RECORDING.swap(false, Ordering::SeqCst) && msg == WM_MBUTTONDOWN {
                if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                    let _ = handle.emit("hotkey-recorded", "MouseMiddle");
                }
                return LRESULT(1);
            }

            // Click Elsewhere to Hide Logic
            if msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN {
                if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                    if let Some(window) = handle.get_webview_window("main") {
                        if !IGNORE_BLUR.load(Ordering::Relaxed) {
                            let mouse_struct = *(l_param.0 as *const MSLLHOOKSTRUCT);
                            let point = mouse_struct.pt;

                            if let Ok(hwnd_raw) = window.hwnd() {
                                let main_hwnd = HWND(hwnd_raw.0);
                                if !WindowExt::is_window_visible(main_hwnd) {
                                    return CallNextHookEx(None, n_code, w_param, l_param);
                                }
                                let mut rect = RECT::default();
                                let _ = windows::Win32::UI::WindowsAndMessaging::GetWindowRect(
                                    main_hwnd, &mut rect,
                                );

                                // Boundary check: Is point outside the rect? (with 5px margin of safety)
                                let margin = 5;
                                let is_outside = point.x < rect.left - margin
                                    || point.x > rect.right + margin
                                    || point.y < rect.top - margin
                                    || point.y > rect.bottom + margin;

                                if is_outside {
                                    // Status check before hiding
                                    if !WindowExt::is_window_visible(main_hwnd) {
                                        return CallNextHookEx(None, n_code, w_param, l_param);
                                    }

                                    if WINDOW_PINNED.load(Ordering::Relaxed) {
                                        // Pinned: Just reset focusable state to ensure we don't retain focus.
                                        // NEVER call tauri window APIs synchronously from a low-level
                                        // hook callback: they block the hook thread waiting on the
                                        // main thread, which stalls the whole keyboard/mouse hook
                                        // chain (recording becomes unresponsive, events pile up).
                                        let handle_clone = handle.clone();
                                        std::thread::spawn(move || {
                                            if let Some(w) =
                                                handle_clone.get_webview_window("main")
                                            {
                                                let _ = w.set_focusable(false);
                                            }
                                        });
                                    } else {
                                        let handle_clone = handle.clone();
                                        std::thread::spawn(move || {
                                            let _ = hide_window_cmd(handle_clone);
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Handle configured middle mouse hotkey
            if msg == WM_MBUTTONDOWN {
                let current = HOTKEY_STRING.lock().unwrap().to_lowercase();
                if current == "mousemiddle" || current == "mbutton" {
                    if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                        // Must not call window APIs synchronously from a hook callback
                        // (deadlocks the hook thread); offload to a worker thread.
                        let handle_clone = handle.clone();
                        std::thread::spawn(move || toggle_window(&handle_clone));
                    }
                    return LRESULT(1);
                }
            }
        }
    }

    CallNextHookEx(None, n_code, w_param, l_param)
}

pub fn parse_hotkey_for_hook(hotkey: &str) -> Option<HookHotkey> {
    let parts: Vec<&str> = hotkey.split('+').collect();
    let mut vk = 0u32;
    let mut ctrl = false;
    let mut shift = false;
    let mut alt = false;
    let mut win = false;

    for part in parts {
        let part_upper = part.trim().to_uppercase();
        match part_upper.as_str() {
            "CTRL" | "CONTROL" => ctrl = true,
            "SHIFT" => shift = true,
            "ALT" | "MENU" => alt = true,
            "SUPER" | "WIN" | "COMMAND" | "META" => win = true,
            "SPACE" => vk = 0x20,
            "ENTER" | "RETURN" => vk = 0x0D,
            "TAB" => vk = 0x09,
            "BACKSPACE" => vk = 0x08,
            "DELETE" => vk = 0x2E,
            "INSERT" => vk = 0x2D,
            "PAGEUP" => vk = 0x21,
            "PAGEDOWN" => vk = 0x22,
            "END" => vk = 0x23,
            "HOME" => vk = 0x24,
            "LEFT" => vk = 0x25,
            "UP" => vk = 0x26,
            "RIGHT" => vk = 0x27,
            "DOWN" => vk = 0x28,
            "PLUS" | "=" => vk = 0xBB,
            "COMMA" | "," => vk = 0xBC,
            "MINUS" | "-" => vk = 0xBD,
            "PERIOD" | "." => vk = 0xBE,
            "/" | "SLASH" => vk = 0xBF,
            "`" | "TILDE" | "GRAVE" => vk = 0xC0,
            ";" | "SEMICOLON" => vk = 0xBA,
            "[" | "LBRACKET" => vk = 0xDB,
            "\\" | "BACKSLASH" => vk = 0xDC,
            "]" | "RBRACKET" => vk = 0xDD,
            "'" | "QUOTE" => vk = 0xDE,
            key if key.starts_with('F') && key.len() > 1 => {
                if let Ok(num) = key[1..].parse::<u32>() {
                    if (1..=24).contains(&num) {
                        vk = 0x6F + num;
                    }
                }
            }
            key => {
                if key.len() == 1 {
                    vk = key.chars().next().unwrap() as u32;
                }
            }
        }
    }

    if vk != 0 {
        Some(HookHotkey {
            vk,
            ctrl,
            shift,
            alt,
            win,
        })
    } else {
        None
    }
}

pub fn is_win_v_hotkey(hotkey: &str) -> bool {
    let parts: Vec<String> = hotkey
        .split('+')
        .map(|p| p.trim().to_uppercase())
        .filter(|p| !p.is_empty())
        .collect();

    if parts.is_empty() {
        return false;
    }

    let mut has_win = false;
    let mut has_v = false;

    for part in &parts {
        match part.as_str() {
            "WIN" | "SUPER" | "COMMAND" | "META" => has_win = true,
            "V" => has_v = true,
            _ => return false,
        }
    }

    has_win && has_v
}
