use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use crate::PetRuntimeState;

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum GlobalInputEvent {
    KeyDown {
        code: &'static str,
    },
    KeyUp {
        code: &'static str,
    },
    MouseMove {
        norm_x: f64,
        norm_y: f64,
        win_rel_x: f64,
        win_rel_y: f64,
        in_pet_bounds: bool,
    },
    MouseDown {
        button: u8,
        win_rel_x: f64,
        win_rel_y: f64,
        in_pet_bounds: bool,
    },
    MouseUp {
        button: u8,
        in_pet_bounds: bool,
    },
    Wheel {
        delta_y: f64,
    },
}

#[derive(Clone, Copy, Default)]
pub struct WindowSnapshot {
    pub win_x_logical: f64,
    pub win_y_logical: f64,
    pub win_w_logical: f64,
    pub win_h_logical: f64,
    pub scale_factor: f64,
    pub passthrough_locked: bool,
    pub holding_treat: bool,
}

impl WindowSnapshot {
    fn from_window(win: &WebviewWindow) -> Option<Self> {
        let scale = win.scale_factor().ok().unwrap_or(1.0).max(0.5);
        let pos = win.outer_position().ok()?;
        let size = win.outer_size().ok()?;
        Some(Self {
            win_x_logical: pos.x as f64 / scale,
            win_y_logical: pos.y as f64 / scale,
            win_w_logical: size.width as f64 / scale,
            win_h_logical: size.height as f64 / scale,
            scale_factor: scale,
            ..Self::default()
        })
    }

    /// Returns `(win_rel_x, win_rel_y, is_inside_interactive_pet_zone)`
    pub fn evaluate_cursor(&self, cursor_logical_x: f64, cursor_logical_y: f64) -> (f64, f64, bool) {
        let rel_x = cursor_logical_x - self.win_x_logical;
        let rel_y = cursor_logical_y - self.win_y_logical;

        if self.win_w_logical <= 1.0 || self.win_h_logical <= 1.0 {
            return (rel_x, rel_y, false);
        }

        let rx = rel_x / self.win_w_logical;
        let ry = rel_y / self.win_h_logical;

        if !(0.0..=1.0).contains(&rx) || !(0.0..=1.0).contains(&ry) {
            return (rel_x, rel_y, false);
        }

        // Top ~17% is transparent sky reserved for keycap popups / Zzz / Combo badge -> click-through!
        let in_main_box = ry >= 0.17 && ry <= 0.97 && rx >= 0.06 && rx <= 0.94;
        let in_upper_empty_corner = ry < 0.36 && !(0.15..=0.85).contains(&rx);
        let interactive = in_main_box && !in_upper_empty_corner;

        (rel_x, rel_y, interactive)
    }
}

pub fn start_global_input_and_passthrough(
    app: AppHandle,
    state: Arc<Mutex<PetRuntimeState>>,
) {
    let shared_snap = Arc::new(Mutex::new(WindowSnapshot::default()));
    let tap_active = Arc::new(AtomicBool::new(false));

    // Thread 1: Lightweight 30ms Smart Click-Through & Fallback Cursor Tracker
    {
        let app_clone = app.clone();
        let state_clone = state.clone();
        let snap_clone = shared_snap.clone();
        let tap_flag = tap_active.clone();

        std::thread::spawn(move || {
            let mut last_ignore: Option<bool> = None;
            let mut last_cursor: (f64, f64) = (-9999.0, -9999.0);

            loop {
                std::thread::sleep(Duration::from_millis(28));

                let Some(win) = app_clone.get_webview_window("main") else {
                    continue;
                };

                // Window queries wait for the UI thread. Never hold the state lock here.
                let Some(mut snap) = WindowSnapshot::from_window(&win) else {
                    continue;
                };
                let menu_guard_active = {
                    let Ok(guard) = state_clone.lock() else {
                        continue;
                    };
                    snap.passthrough_locked = guard.passthrough_locked;
                    snap.holding_treat = guard.holding_treat;
                    guard
                        .pause_passthrough_until
                        .map(|until| Instant::now() < until)
                        .unwrap_or(false)
                };

                if let Ok(mut s_lock) = snap_clone.lock() {
                    *s_lock = snap;
                }

                let Some((cx, cy, sw, sh)) = query_cursor_and_screen_logical(snap.scale_factor) else {
                    continue;
                };

                let (rel_x, rel_y, interactive) = snap.evaluate_cursor(cx, cy);

                let want_ignore = if menu_guard_active {
                    false
                } else if snap.passthrough_locked && !snap.holding_treat {
                    true
                } else {
                    !interactive
                };

                if last_ignore != Some(want_ignore) {
                    if win.set_ignore_cursor_events(want_ignore).is_ok() {
                        last_ignore = Some(want_ignore);
                    }
                }

                // Fallback mouse-move emission when low-level OS hook isn't active yet
                if !tap_flag.load(Ordering::Relaxed) {
                    let moved = (cx - last_cursor.0).hypot(cy - last_cursor.1);
                    if moved > 0.8 {
                        last_cursor = (cx, cy);
                        let norm_x = (cx / sw.max(1.0)).clamp(0.0, 1.0);
                        let norm_y = (cy / sh.max(1.0)).clamp(0.0, 1.0);
                        let _ = app_clone.emit(
                            "global-input",
                            GlobalInputEvent::MouseMove {
                                norm_x,
                                norm_y,
                                win_rel_x: rel_x,
                                win_rel_y: rel_y,
                                in_pet_bounds: interactive,
                            },
                        );
                    }
                }
            }
        });
    }

    // Thread 2: Native Passive OS Global Keyboard & Mouse Hook (macOS CGEventTap / Windows LL Hooks)
    spawn_platform_hook_thread(app, shared_snap, tap_active);
}

// ============================================================================
// macOS Implementation (CoreGraphics passive event tap)
// ============================================================================
#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use std::ffi::c_void;
    use std::ptr;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGPoint {
        x: f64,
        y: f64,
    }

    type CGEventRef = *mut c_void;
    type CGEventTapProxy = *mut c_void;
    type CFMachPortRef = *mut c_void;
    type CFRunLoopSourceRef = *mut c_void;
    type CFRunLoopRef = *mut c_void;
    type CFStringRef = *const c_void;
    type CFAllocatorRef = *const c_void;

    const K_CG_SESSION_EVENT_TAP: u32 = 1;
    const K_CG_HEAD_INSERT_EVENT_TAP: u32 = 0;
    const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: u32 = 1;

    const K_CG_EVENT_LEFT_MOUSE_DOWN: u32 = 1;
    const K_CG_EVENT_LEFT_MOUSE_UP: u32 = 2;
    const K_CG_EVENT_RIGHT_MOUSE_DOWN: u32 = 3;
    const K_CG_EVENT_RIGHT_MOUSE_UP: u32 = 4;
    const K_CG_EVENT_MOUSE_MOVED: u32 = 5;
    const K_CG_EVENT_LEFT_MOUSE_DRAGGED: u32 = 6;
    const K_CG_EVENT_RIGHT_MOUSE_DRAGGED: u32 = 7;
    const K_CG_EVENT_KEY_DOWN: u32 = 10;
    const K_CG_EVENT_KEY_UP: u32 = 11;
    const K_CG_EVENT_FLAGS_CHANGED: u32 = 12;
    const K_CG_EVENT_SCROLL_WHEEL: u32 = 22;
    const K_CG_EVENT_OTHER_MOUSE_DOWN: u32 = 25;
    const K_CG_EVENT_OTHER_MOUSE_UP: u32 = 26;
    const K_CG_EVENT_OTHER_MOUSE_DRAGGED: u32 = 27;
    const K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;
    const K_CG_EVENT_TAP_DISABLED_BY_USER: u32 = 0xFFFF_FFFF;

    const K_CG_KEYBOARD_EVENT_KEYCODE: u32 = 9;
    const K_CG_SCROLL_EVENT_DELTA_AXIS_1: u32 = 11;

    const FLAG_CAPS: u64 = 0x0001_0000;
    const FLAG_SHIFT: u64 = 0x0002_0000;
    const FLAG_CTRL: u64 = 0x0004_0000;
    const FLAG_ALT: u64 = 0x0008_0000;
    const FLAG_CMD: u64 = 0x0010_0000;

    type CGEventTapCallBack = extern "C" fn(
        proxy: CGEventTapProxy,
        etype: u32,
        event: CGEventRef,
        user_info: *mut c_void,
    ) -> CGEventRef;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventCreate(source: *const c_void) -> CGEventRef;
        fn CGEventGetLocation(event: CGEventRef) -> CGPoint;
        fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
        fn CGEventGetFlags(event: CGEventRef) -> u64;
        fn CGMainDisplayID() -> u32;
        fn CGDisplayPixelsWide(display: u32) -> usize;
        fn CGDisplayPixelsHigh(display: u32) -> usize;
        fn CGEventTapCreate(
            tap: u32,
            place: u32,
            options: u32,
            events_of_interest: u64,
            callback: CGEventTapCallBack,
            user_info: *mut c_void,
        ) -> CFMachPortRef;
        fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
        fn CGEventTapIsEnabled(tap: CFMachPortRef) -> bool;
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess() -> bool;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        static kCFRunLoopCommonModes: CFStringRef;
        static kCFRunLoopDefaultMode: CFStringRef;

        fn CFRelease(cf: *const c_void);
        fn CFMachPortInvalidate(port: CFMachPortRef);
        fn CFMachPortCreateRunLoopSource(
            allocator: CFAllocatorRef,
            port: CFMachPortRef,
            order: isize,
        ) -> CFRunLoopSourceRef;
        fn CFRunLoopGetCurrent() -> CFRunLoopRef;
        fn CFRunLoopAddSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
        fn CFRunLoopRemoveSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
        fn CFRunLoopRunInMode(
            mode: CFStringRef,
            seconds: f64,
            return_after_source_handled: bool,
        ) -> i32;
    }

    fn has_input_monitoring_access() -> bool {
        unsafe { CGPreflightListenEventAccess() }
    }

    pub fn request_input_monitoring() {
        if !has_input_monitoring_access() {
            unsafe { CGRequestListenEventAccess() };
        }
    }

    pub fn open_input_monitoring_settings() {
        request_input_monitoring();
        let _ = std::process::Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
            .spawn();
    }

    pub fn query_cursor_and_screen_logical(_scale: f64) -> Option<(f64, f64, f64, f64)> {
        unsafe {
            let ev = CGEventCreate(ptr::null());
            if ev.is_null() {
                return None;
            }
            let loc = CGEventGetLocation(ev);
            CFRelease(ev as *const c_void);

            let main_id = CGMainDisplayID();
            let sw = CGDisplayPixelsWide(main_id) as f64;
            let sh = CGDisplayPixelsHigh(main_id) as f64;
            Some((loc.x, loc.y, sw.max(1.0), sh.max(1.0)))
        }
    }

    struct TapContext {
        app: AppHandle,
        snap: Arc<Mutex<WindowSnapshot>>,
        tap_port: CFMachPortRef,
        last_move_emit: Instant,
        prev_flags: u64,
    }

    extern "C" fn event_tap_callback(
        _proxy: CGEventTapProxy,
        etype: u32,
        event: CGEventRef,
        user_info: *mut c_void,
    ) -> CGEventRef {
        if user_info.is_null() {
            return event;
        }
        let ctx = unsafe { &mut *(user_info as *mut TapContext) };

        if etype == K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT {
            if !ctx.tap_port.is_null() {
                unsafe { CGEventTapEnable(ctx.tap_port, true) };
            }
            return event;
        }
        if etype == K_CG_EVENT_TAP_DISABLED_BY_USER || event.is_null() {
            return event;
        }

        match etype {
            K_CG_EVENT_KEY_DOWN => {
                let kc = unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) };
                if let Some(code) = macos_keycode_to_dom(kc) {
                    let _ = ctx.app.emit("global-input", GlobalInputEvent::KeyDown { code });
                }
            }
            K_CG_EVENT_KEY_UP => {
                let kc = unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) };
                if let Some(code) = macos_keycode_to_dom(kc) {
                    let _ = ctx.app.emit("global-input", GlobalInputEvent::KeyUp { code });
                }
            }
            K_CG_EVENT_FLAGS_CHANGED => {
                let kc = unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) };
                let flags = unsafe { CGEventGetFlags(event) };
                if let Some((code, mask)) = macos_modifier_keycode(kc) {
                    let is_down = (flags & mask) != 0;
                    let was_down = (ctx.prev_flags & mask) != 0;
                    if is_down != was_down {
                        let ev = if is_down {
                            GlobalInputEvent::KeyDown { code }
                        } else {
                            GlobalInputEvent::KeyUp { code }
                        };
                        let _ = ctx.app.emit("global-input", ev);
                    }
                }
                ctx.prev_flags = flags;
            }
            K_CG_EVENT_MOUSE_MOVED
            | K_CG_EVENT_LEFT_MOUSE_DRAGGED
            | K_CG_EVENT_RIGHT_MOUSE_DRAGGED
            | K_CG_EVENT_OTHER_MOUSE_DRAGGED => {
                let now = Instant::now();
                if now.duration_since(ctx.last_move_emit) >= Duration::from_millis(15) {
                    ctx.last_move_emit = now;
                    let loc = unsafe { CGEventGetLocation(event) };
                    let (sw, sh) = unsafe {
                        let d = CGMainDisplayID();
                        (CGDisplayPixelsWide(d) as f64, CGDisplayPixelsHigh(d) as f64)
                    };
                    let (rel_x, rel_y, in_pet) = ctx
                        .snap
                        .lock()
                        .map(|s| s.evaluate_cursor(loc.x, loc.y))
                        .unwrap_or((0.0, 0.0, false));
                    let _ = ctx.app.emit(
                        "global-input",
                        GlobalInputEvent::MouseMove {
                            norm_x: (loc.x / sw.max(1.0)).clamp(0.0, 1.0),
                            norm_y: (loc.y / sh.max(1.0)).clamp(0.0, 1.0),
                            win_rel_x: rel_x,
                            win_rel_y: rel_y,
                            in_pet_bounds: in_pet,
                        },
                    );
                }
            }
            K_CG_EVENT_LEFT_MOUSE_DOWN | K_CG_EVENT_RIGHT_MOUSE_DOWN | K_CG_EVENT_OTHER_MOUSE_DOWN => {
                let loc = unsafe { CGEventGetLocation(event) };
                let (rel_x, rel_y, in_pet) = ctx
                    .snap
                    .lock()
                    .map(|s| s.evaluate_cursor(loc.x, loc.y))
                    .unwrap_or((0.0, 0.0, false));
                let button = match etype {
                    K_CG_EVENT_LEFT_MOUSE_DOWN => 0,
                    K_CG_EVENT_RIGHT_MOUSE_DOWN => 2,
                    _ => 1,
                };
                let _ = ctx.app.emit(
                    "global-input",
                    GlobalInputEvent::MouseDown {
                        button,
                        win_rel_x: rel_x,
                        win_rel_y: rel_y,
                        in_pet_bounds: in_pet,
                    },
                );
            }
            K_CG_EVENT_LEFT_MOUSE_UP | K_CG_EVENT_RIGHT_MOUSE_UP | K_CG_EVENT_OTHER_MOUSE_UP => {
                let loc = unsafe { CGEventGetLocation(event) };
                let in_pet = ctx
                    .snap
                    .lock()
                    .map(|s| s.evaluate_cursor(loc.x, loc.y).2)
                    .unwrap_or(false);
                let button = match etype {
                    K_CG_EVENT_LEFT_MOUSE_UP => 0,
                    K_CG_EVENT_RIGHT_MOUSE_UP => 2,
                    _ => 1,
                };
                let _ = ctx.app.emit(
                    "global-input",
                    GlobalInputEvent::MouseUp {
                        button,
                        in_pet_bounds: in_pet,
                    },
                );
            }
            K_CG_EVENT_SCROLL_WHEEL => {
                let dy = unsafe { CGEventGetIntegerValueField(event, K_CG_SCROLL_EVENT_DELTA_AXIS_1) };
                if dy != 0 {
                    let _ = ctx.app.emit(
                        "global-input",
                        GlobalInputEvent::Wheel {
                            delta_y: (-dy as f64) * 12.0,
                        },
                    );
                }
            }
            _ => {}
        }

        event
    }

    pub fn spawn_platform_hook_thread(
        app: AppHandle,
        snap: Arc<Mutex<WindowSnapshot>>,
        tap_active: Arc<AtomicBool>,
    ) {
        std::thread::spawn(move || {
            let mask: u64 = (1 << K_CG_EVENT_KEY_DOWN)
                | (1 << K_CG_EVENT_KEY_UP)
                | (1 << K_CG_EVENT_FLAGS_CHANGED)
                | (1 << K_CG_EVENT_MOUSE_MOVED)
                | (1 << K_CG_EVENT_LEFT_MOUSE_DRAGGED)
                | (1 << K_CG_EVENT_RIGHT_MOUSE_DRAGGED)
                | (1 << K_CG_EVENT_OTHER_MOUSE_DRAGGED)
                | (1 << K_CG_EVENT_LEFT_MOUSE_DOWN)
                | (1 << K_CG_EVENT_LEFT_MOUSE_UP)
                | (1 << K_CG_EVENT_RIGHT_MOUSE_DOWN)
                | (1 << K_CG_EVENT_RIGHT_MOUSE_UP)
                | (1 << K_CG_EVENT_OTHER_MOUSE_DOWN)
                | (1 << K_CG_EVENT_OTHER_MOUSE_UP)
                | (1 << K_CG_EVENT_SCROLL_WHEEL);

            let mut ctx_box = Box::new(TapContext {
                app,
                snap,
                tap_port: ptr::null_mut(),
                last_move_emit: Instant::now(),
                prev_flags: 0,
            });

            loop {
                let has_listen_access = has_input_monitoring_access();
                unsafe {
                    let user_ptr = (&mut *ctx_box) as *mut TapContext as *mut c_void;
                    let tap = CGEventTapCreate(
                        K_CG_SESSION_EVENT_TAP,
                        K_CG_HEAD_INSERT_EVENT_TAP,
                        K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
                        mask,
                        event_tap_callback,
                        user_ptr,
                    );

                    if !tap.is_null() {
                        let source = CFMachPortCreateRunLoopSource(ptr::null(), tap, 0);
                        if !source.is_null() {
                            ctx_box.tap_port = tap;
                            ctx_box.prev_flags = 0;
                            let rl = CFRunLoopGetCurrent();
                            CFRunLoopAddSource(rl, source, kCFRunLoopCommonModes);
                            CGEventTapEnable(tap, true);
                            loop {
                                tap_active.store(CGEventTapIsEnabled(tap), Ordering::Relaxed);
                                CFRunLoopRunInMode(kCFRunLoopDefaultMode, 2.5, false);
                                // macOS can allow a mouse-only tap until keyboard permission is granted.
                                if has_input_monitoring_access() != has_listen_access {
                                    break;
                                }
                            }
                            tap_active.store(false, Ordering::Relaxed);
                            CFRunLoopRemoveSource(rl, source, kCFRunLoopCommonModes);
                            CFRelease(source);
                            ctx_box.tap_port = ptr::null_mut();
                        }
                        CFMachPortInvalidate(tap);
                        CFRelease(tap);
                    }
                }

                std::thread::sleep(Duration::from_millis(2500));
            }
        });
    }

    fn macos_modifier_keycode(kc: i64) -> Option<(&'static str, u64)> {
        match kc {
            0x37 => Some(("MetaLeft", FLAG_CMD)),
            0x36 => Some(("MetaRight", FLAG_CMD)),
            0x38 => Some(("ShiftLeft", FLAG_SHIFT)),
            0x3C => Some(("ShiftRight", FLAG_SHIFT)),
            0x3A => Some(("AltLeft", FLAG_ALT)),
            0x3D => Some(("AltRight", FLAG_ALT)),
            0x3B => Some(("ControlLeft", FLAG_CTRL)),
            0x3E => Some(("ControlRight", FLAG_CTRL)),
            0x39 => Some(("CapsLock", FLAG_CAPS)),
            _ => None,
        }
    }

    fn macos_keycode_to_dom(kc: i64) -> Option<&'static str> {
        match kc {
            0x00 => Some("KeyA"),
            0x01 => Some("KeyS"),
            0x02 => Some("KeyD"),
            0x03 => Some("KeyF"),
            0x04 => Some("KeyH"),
            0x05 => Some("KeyG"),
            0x06 => Some("KeyZ"),
            0x07 => Some("KeyX"),
            0x08 => Some("KeyC"),
            0x09 => Some("KeyV"),
            0x0B => Some("KeyB"),
            0x0C => Some("KeyQ"),
            0x0D => Some("KeyW"),
            0x0E => Some("KeyE"),
            0x0F => Some("KeyR"),
            0x10 => Some("KeyY"),
            0x11 => Some("KeyT"),
            0x12 => Some("Digit1"),
            0x13 => Some("Digit2"),
            0x14 => Some("Digit3"),
            0x15 => Some("Digit4"),
            0x16 => Some("Digit6"),
            0x17 => Some("Digit5"),
            0x18 => Some("Equal"),
            0x19 => Some("Digit9"),
            0x1A => Some("Digit7"),
            0x1B => Some("Minus"),
            0x1C => Some("Digit8"),
            0x1D => Some("Digit0"),
            0x1E => Some("BracketRight"),
            0x1F => Some("KeyO"),
            0x20 => Some("KeyU"),
            0x21 => Some("BracketLeft"),
            0x22 => Some("KeyI"),
            0x23 => Some("KeyP"),
            0x24 => Some("Enter"),
            0x25 => Some("KeyL"),
            0x26 => Some("KeyJ"),
            0x27 => Some("Quote"),
            0x28 => Some("KeyK"),
            0x29 => Some("Semicolon"),
            0x2A => Some("Backslash"),
            0x2B => Some("Comma"),
            0x2C => Some("Slash"),
            0x2D => Some("KeyN"),
            0x2E => Some("KeyM"),
            0x2F => Some("Period"),
            0x30 => Some("Tab"),
            0x31 => Some("Space"),
            0x32 => Some("Backquote"),
            0x33 => Some("Backspace"),
            0x35 => Some("Escape"),
            0x4C => Some("NumpadEnter"),
            0x75 => Some("Delete"),
            0x73 => Some("Home"),
            0x77 => Some("End"),
            0x74 => Some("PageUp"),
            0x79 => Some("PageDown"),
            0x7B => Some("ArrowLeft"),
            0x7C => Some("ArrowRight"),
            0x7D => Some("ArrowDown"),
            0x7E => Some("ArrowUp"),
            0x7A => Some("F1"),
            0x78 => Some("F2"),
            0x63 => Some("F3"),
            0x76 => Some("F4"),
            0x60 => Some("F5"),
            0x61 => Some("F6"),
            0x62 => Some("F7"),
            0x64 => Some("F8"),
            0x65 => Some("F9"),
            0x6D => Some("F10"),
            0x67 => Some("F11"),
            0x6F => Some("F12"),
            _ => None,
        }
    }
}

// ============================================================================
// Windows Implementation (Win32 WH_KEYBOARD_LL + WH_MOUSE_LL)
// ============================================================================
#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use std::ptr;
    use std::sync::OnceLock;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetCursorPos, GetMessageW, GetSystemMetrics,
        SetWindowsHookExW, TranslateMessage, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, SM_CXSCREEN,
        SM_CYSCREEN, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN,
        WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_RBUTTONDOWN,
        WM_RBUTTONUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    struct WinHookState {
        app: AppHandle,
        snap: Arc<Mutex<WindowSnapshot>>,
        last_move: Mutex<Instant>,
    }

    static WIN_STATE: OnceLock<WinHookState> = OnceLock::new();

    pub fn query_cursor_and_screen_logical(scale: f64) -> Option<(f64, f64, f64, f64)> {
        unsafe {
            let mut pt = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut pt) == 0 {
                return None;
            }
            let s = scale.max(0.5);
            let sw = GetSystemMetrics(SM_CXSCREEN) as f64 / s;
            let sh = GetSystemMetrics(SM_CYSCREEN) as f64 / s;
            Some((pt.x as f64 / s, pt.y as f64 / s, sw.max(1.0), sh.max(1.0)))
        }
    }

    unsafe extern "system" fn low_level_kb_proc(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code >= 0 && lparam != 0 {
            if let Some(st) = WIN_STATE.get() {
                let kb = &*(lparam as *const KBDLLHOOKSTRUCT);
                if let Some(dom_code) = win_vk_to_dom(kb.vkCode) {
                    let msg = wparam as u32;
                    if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
                        let _ = st.app.emit("global-input", GlobalInputEvent::KeyDown { code: dom_code });
                    } else if msg == WM_KEYUP || msg == WM_SYSKEYUP {
                        let _ = st.app.emit("global-input", GlobalInputEvent::KeyUp { code: dom_code });
                    }
                }
            }
        }
        CallNextHookEx(ptr::null_mut(), code, wparam, lparam)
    }

    unsafe extern "system" fn low_level_mouse_proc(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code >= 0 && lparam != 0 {
            if let Some(st) = WIN_STATE.get() {
                let ms = &*(lparam as *const MSLLHOOKSTRUCT);
                let msg = wparam as u32;
                let (scale, snap_copy) = st
                    .snap
                    .lock()
                    .map(|s| (s.scale_factor.max(0.5), *s))
                    .unwrap_or((1.0, WindowSnapshot::default()));
                let cx = ms.pt.x as f64 / scale;
                let cy = ms.pt.y as f64 / scale;

                match msg {
                    WM_MOUSEMOVE => {
                        if let Ok(mut last) = st.last_move.lock() {
                            let now = Instant::now();
                            if now.duration_since(*last) >= Duration::from_millis(15) {
                                *last = now;
                                let sw = (GetSystemMetrics(SM_CXSCREEN) as f64 / scale).max(1.0);
                                let sh = (GetSystemMetrics(SM_CYSCREEN) as f64 / scale).max(1.0);
                                let (rel_x, rel_y, in_pet) = snap_copy.evaluate_cursor(cx, cy);
                                let _ = st.app.emit(
                                    "global-input",
                                    GlobalInputEvent::MouseMove {
                                        norm_x: (cx / sw).clamp(0.0, 1.0),
                                        norm_y: (cy / sh).clamp(0.0, 1.0),
                                        win_rel_x: rel_x,
                                        win_rel_y: rel_y,
                                        in_pet_bounds: in_pet,
                                    },
                                );
                            }
                        }
                    }
                    WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN => {
                        let (rel_x, rel_y, in_pet) = snap_copy.evaluate_cursor(cx, cy);
                        let button = match msg {
                            WM_LBUTTONDOWN => 0,
                            WM_RBUTTONDOWN => 2,
                            _ => 1,
                        };
                        let _ = st.app.emit(
                            "global-input",
                            GlobalInputEvent::MouseDown {
                                button,
                                win_rel_x: rel_x,
                                win_rel_y: rel_y,
                                in_pet_bounds: in_pet,
                            },
                        );
                    }
                    WM_LBUTTONUP | WM_RBUTTONUP | WM_MBUTTONUP => {
                        let in_pet = snap_copy.evaluate_cursor(cx, cy).2;
                        let button = match msg {
                            WM_LBUTTONUP => 0,
                            WM_RBUTTONUP => 2,
                            _ => 1,
                        };
                        let _ = st.app.emit(
                            "global-input",
                            GlobalInputEvent::MouseUp {
                                button,
                                in_pet_bounds: in_pet,
                            },
                        );
                    }
                    WM_MOUSEWHEEL => {
                        let wheel_delta = ((ms.mouseData >> 16) as i16) as f64;
                        if wheel_delta.abs() > 0.1 {
                            let _ = st.app.emit(
                                "global-input",
                                GlobalInputEvent::Wheel {
                                    delta_y: -wheel_delta * 0.5,
                                },
                            );
                        }
                    }
                    _ => {}
                }
            }
        }
        CallNextHookEx(ptr::null_mut(), code, wparam, lparam)
    }

    pub fn spawn_platform_hook_thread(
        app: AppHandle,
        snap: Arc<Mutex<WindowSnapshot>>,
        tap_active: Arc<AtomicBool>,
    ) {
        let _ = WIN_STATE.set(WinHookState {
            app,
            snap,
            last_move: Mutex::new(Instant::now()),
        });

        std::thread::spawn(move || unsafe {
            let hmod = GetModuleHandleW(ptr::null());
            let kb_hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(low_level_kb_proc), hmod, 0);
            let ms_hook = SetWindowsHookExW(WH_MOUSE_LL, Some(low_level_mouse_proc), hmod, 0);
            if !kb_hook.is_null() && !ms_hook.is_null() {
                tap_active.store(true, Ordering::Relaxed);
            }
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, ptr::null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
    }

    fn win_vk_to_dom(vk: u32) -> Option<&'static str> {
        match vk {
            0x41 => Some("KeyA"),
            0x42 => Some("KeyB"),
            0x43 => Some("KeyC"),
            0x44 => Some("KeyD"),
            0x45 => Some("KeyE"),
            0x46 => Some("KeyF"),
            0x47 => Some("KeyG"),
            0x48 => Some("KeyH"),
            0x49 => Some("KeyI"),
            0x4A => Some("KeyJ"),
            0x4B => Some("KeyK"),
            0x4C => Some("KeyL"),
            0x4D => Some("KeyM"),
            0x4E => Some("KeyN"),
            0x4F => Some("KeyO"),
            0x50 => Some("KeyP"),
            0x51 => Some("KeyQ"),
            0x52 => Some("KeyR"),
            0x53 => Some("KeyS"),
            0x54 => Some("KeyT"),
            0x55 => Some("KeyU"),
            0x56 => Some("KeyV"),
            0x57 => Some("KeyW"),
            0x58 => Some("KeyX"),
            0x59 => Some("KeyY"),
            0x5A => Some("KeyZ"),
            0x30 => Some("Digit0"),
            0x31 => Some("Digit1"),
            0x32 => Some("Digit2"),
            0x33 => Some("Digit3"),
            0x34 => Some("Digit4"),
            0x35 => Some("Digit5"),
            0x36 => Some("Digit6"),
            0x37 => Some("Digit7"),
            0x38 => Some("Digit8"),
            0x39 => Some("Digit9"),
            0x08 => Some("Backspace"),
            0x09 => Some("Tab"),
            0x0D => Some("Enter"),
            0x1B => Some("Escape"),
            0x20 => Some("Space"),
            0x14 => Some("CapsLock"),
            0xA0 | 0x10 => Some("ShiftLeft"),
            0xA1 => Some("ShiftRight"),
            0xA2 | 0x11 => Some("ControlLeft"),
            0xA3 => Some("ControlRight"),
            0xA4 | 0x12 => Some("AltLeft"),
            0xA5 => Some("AltRight"),
            0x5B => Some("MetaLeft"),
            0x5C => Some("MetaRight"),
            0x25 => Some("ArrowLeft"),
            0x26 => Some("ArrowUp"),
            0x27 => Some("ArrowRight"),
            0x28 => Some("ArrowDown"),
            0x2E => Some("Delete"),
            0x24 => Some("Home"),
            0x23 => Some("End"),
            0x21 => Some("PageUp"),
            0x22 => Some("PageDown"),
            0xBA => Some("Semicolon"),
            0xBB => Some("Equal"),
            0xBC => Some("Comma"),
            0xBD => Some("Minus"),
            0xBE => Some("Period"),
            0xBF => Some("Slash"),
            0xC0 => Some("Backquote"),
            0xDB => Some("BracketLeft"),
            0xDC => Some("Backslash"),
            0xDD => Some("BracketRight"),
            0xDE => Some("Quote"),
            0x70 => Some("F1"),
            0x71 => Some("F2"),
            0x72 => Some("F3"),
            0x73 => Some("F4"),
            0x74 => Some("F5"),
            0x75 => Some("F6"),
            0x76 => Some("F7"),
            0x77 => Some("F8"),
            0x78 => Some("F9"),
            0x79 => Some("F10"),
            0x7A => Some("F11"),
            0x7B => Some("F12"),
            _ => None,
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::*;
    pub fn query_cursor_and_screen_logical(_scale: f64) -> Option<(f64, f64, f64, f64)> {
        None
    }
    pub fn spawn_platform_hook_thread(
        _app: AppHandle,
        _snap: Arc<Mutex<WindowSnapshot>>,
        _tap_active: Arc<AtomicBool>,
    ) {
    }
}

#[cfg(target_os = "macos")]
pub use platform::{open_input_monitoring_settings, request_input_monitoring};
use platform::{query_cursor_and_screen_logical, spawn_platform_hook_thread};
