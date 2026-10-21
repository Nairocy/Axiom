// Global state module
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicPtr, AtomicU32, AtomicU64, AtomicUsize};

pub static GLOBAL_APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();
pub static HOOK_HANDLE: AtomicPtr<std::ffi::c_void> = AtomicPtr::new(null_mut());
pub static HOOK_MOUSE_HANDLE: AtomicPtr<std::ffi::c_void> = AtomicPtr::new(null_mut());
pub static HOTKEY_STRING: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

#[derive(Clone, Debug)]
pub struct HookHotkey {
    pub vk: u32,
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub win: bool,
}

pub static TARGET_HOTKEY: std::sync::Mutex<Option<HookHotkey>> = std::sync::Mutex::new(None);

// Win+ hotkeys are now handled via tauri-plugin-global-shortcut.

pub static IS_RECORDING: AtomicBool = AtomicBool::new(false);
pub static IGNORE_BLUR: AtomicBool = AtomicBool::new(false);
pub static WINDOW_PINNED: AtomicBool = AtomicBool::new(false);
pub static CLIPBOARD_MONITOR_PAUSED: AtomicBool = AtomicBool::new(false);
pub static LAST_ACTIVE_HWND: AtomicUsize = AtomicUsize::new(0);
pub static LAST_APP_SET_HASH: AtomicU64 = AtomicU64::new(0);
pub static LAST_APP_SET_HASH_ALT: AtomicU64 = AtomicU64::new(0);
pub static LAST_APP_SET_IMAGE_VISUAL_HASH: AtomicU64 = AtomicU64::new(0);
pub static LAST_APP_SET_TIMESTAMP: AtomicU64 = AtomicU64::new(0);
pub static LAST_TOGGLE_TIMESTAMP: AtomicU64 = AtomicU64::new(0);
pub static LAST_SHOW_TIMESTAMP: AtomicU64 = AtomicU64::new(0);
pub static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);
// Custom thread message sent to the hook thread to reinstall the low-level
// keyboard hook at the HEAD of the hook chain. Low-level hook chains are LIFO:
// Axiom installs its hooks at startup (chain tail), then WebView2/Chromium
// installs its own WH_KEYBOARD_LL afterwards (chain head). While the WebView2
// window is visible its hook can stall the whole keyboard chain, so our tail
// hook never sees key events (recording appears dead, KEY_EVENT_COUNT stays 0).
// Uninstall + reinstall pushes our hook back to the head, ahead of WebView2.
pub const HOOK_REINSTALL_MSG: u32 = 0x8001; // WM_APP + 1
pub static TASKBAR_CREATED_MSG: AtomicU32 = AtomicU32::new(0);
pub static QUICK_PASTE_DIGIT_MASK: AtomicU32 = AtomicU32::new(0);

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DockPosition {
    None,
    Top,
    Left,
    Right,
}

pub static CURRENT_DOCK: AtomicI32 = AtomicI32::new(0); // 0: None, 1: Top, 2: Left, 3: Right
pub static IS_HIDDEN: AtomicBool = AtomicBool::new(false);
pub static IS_MOUSE_BUTTON_DOWN: AtomicBool = AtomicBool::new(false);
pub static NAVIGATION_ENABLED: AtomicBool = AtomicBool::new(false);
pub static NAVIGATION_MODE_ACTIVE: AtomicBool = AtomicBool::new(false);
pub static IS_MAIN_WINDOW_FOCUSED: AtomicBool = AtomicBool::new(false);
