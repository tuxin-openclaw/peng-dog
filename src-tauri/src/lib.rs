mod input_hook;

use auto_launch::{AutoLaunch, AutoLaunchBuilder};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, State,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder, Wry,
};

const DEFAULT_SCALE: u32 = 100;
const MIN_SCALE: u32 = 60;
const MAX_SCALE: u32 = 180;
const SIZE_WINDOW_LABEL: &str = "pet-size";

#[derive(Clone)]
pub struct PetRuntimeState {
    pub current_view: String,
    pub desk_dir: String,
    pub scale_pct: u32,
    pub always_on_top: bool,
    pub passthrough_locked: bool,
    pub holding_treat: bool,
    pub sound_enabled: bool,
    pub show_popups: bool,
    pub roam_bark: bool,
    pub cursor_over_pet: bool,
    pub roam_enabled_at: Option<Instant>,
    pub roam_pause_until: Option<Instant>,
    pub pause_passthrough_until: Option<Instant>,
}

impl Default for PetRuntimeState {
    fn default() -> Self {
        Self {
            current_view: "daisy".to_string(),
            desk_dir: "dog".to_string(),
            scale_pct: DEFAULT_SCALE,
            always_on_top: true,
            passthrough_locked: false,
            holding_treat: false,
            sound_enabled: false,
            show_popups: true,
            roam_bark: false,
            cursor_over_pet: false,
            roam_enabled_at: None,
            roam_pause_until: None,
            pause_passthrough_until: None,
        }
    }
}

struct ManagedApp {
    runtime: Arc<Mutex<PetRuntimeState>>,
    menu: Menu<Wry>,
    view_daisy: CheckMenuItem<Wry>,
    view_kuro: CheckMenuItem<Wry>,
    view_sunny: CheckMenuItem<Wry>,
    chk_roam_bark: CheckMenuItem<Wry>,
    desk_user: CheckMenuItem<Wry>,
    desk_dog: CheckMenuItem<Wry>,
    chk_top: CheckMenuItem<Wry>,
    chk_pass: CheckMenuItem<Wry>,
    chk_sound: CheckMenuItem<Wry>,
    chk_popups: CheckMenuItem<Wry>,
    chk_autostart: CheckMenuItem<Wry>,
    autostart: Option<AutoLaunch>,
}

impl ManagedApp {
    // Return a snapshot so callers can update native UI after releasing the state lock.
    fn update_runtime(&self, update: impl FnOnce(&mut PetRuntimeState)) -> Option<PetRuntimeState> {
        let mut state = self.runtime.lock().ok()?;
        update(&mut state);
        Some(state.clone())
    }

    fn sync_checkmarks(&self, st: &PetRuntimeState) {
        let _ = self.view_daisy.set_checked(st.current_view == "daisy");
        let _ = self.view_kuro.set_checked(st.current_view == "kuro");
        let _ = self.view_sunny.set_checked(st.current_view == "sunny");
        let _ = self.chk_roam_bark.set_checked(st.roam_bark);

        let _ = self.desk_user.set_checked(st.desk_dir != "dog");
        let _ = self.desk_dog.set_checked(st.desk_dir == "dog");

        let _ = self.chk_top.set_checked(st.always_on_top);
        let _ = self.chk_pass.set_checked(st.passthrough_locked);
        let _ = self.chk_sound.set_checked(st.sound_enabled);
        let _ = self.chk_popups.set_checked(st.show_popups);
    }

    fn sync_autostart_checkmark(&self) {
        if let Some(autostart) = &self.autostart {
            match autostart.is_enabled() {
                Ok(enabled) => {
                    let _ = self.chk_autostart.set_checked(enabled);
                }
                Err(err) => eprintln!("读取开机启动设置失败：{err}"),
            }
        }
    }
}

#[derive(Clone, Serialize)]
struct FrontendMenuPayload<'a> {
    action: &'a str,
    value: &'a str,
}

#[derive(Clone, Serialize)]
struct RoamStatePayload {
    active: bool,
    moving: bool,
    facing: i8,
    speed: f64,
    bark: bool,
    kickoff: bool,
}

fn build_autostart(app: &AppHandle) -> auto_launch::Result<AutoLaunch> {
    let mut builder = AutoLaunchBuilder::new();
    builder.set_app_name(&app.package_info().name);

    #[cfg(target_os = "macos")]
    {
        use auto_launch::{Error, MacOSLaunchMode};

        builder.set_macos_launch_mode(MacOSLaunchMode::SMAppService);
        match builder.build() {
            Err(Error::UnsupportedOS) => {
                builder.set_macos_launch_mode(MacOSLaunchMode::LaunchAgent);
            }
            result => return result,
        }
    }

    #[cfg(target_os = "windows")]
    builder.set_windows_enable_mode(auto_launch::WindowsEnableMode::CurrentUser);

    let executable = std::env::current_exe()?;
    #[cfg(target_os = "windows")]
    let path = format!("\"{}\"", executable.display());
    #[cfg(not(target_os = "windows"))]
    let path = executable.to_string_lossy();

    builder.set_app_path(&path).build()
}

fn target_logical_size(scale_pct: u32) -> (f64, f64) {
    let s = f64::from(scale_pct.clamp(MIN_SCALE, MAX_SCALE)) / 100.0;
    (231.0 * s, 273.0 * s)
}

fn scale_path(app: &AppHandle) -> tauri::Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join("pet-scale"))
}

fn load_pet_scale(app: &AppHandle) -> u32 {
    scale_path(app)
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|value| value.trim().parse::<u32>().ok())
        .map(|value| value.clamp(MIN_SCALE, MAX_SCALE))
        .unwrap_or(DEFAULT_SCALE)
}

fn show_size_controls(app: &AppHandle) -> tauri::Result<()> {
    let window = match app.get_webview_window(SIZE_WINDOW_LABEL) {
        Some(window) => window,
        None => WebviewWindowBuilder::new(app, SIZE_WINDOW_LABEL, WebviewUrl::App("size.html".into()))
            .title("桌宠尺寸")
            .inner_size(360.0, 156.0)
            .resizable(false)
            .minimizable(false)
            .maximizable(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .visible(false)
            .center()
            .build()?,
    };
    window.show()?;
    window.set_focus()
}

#[derive(Serialize)]
struct PetScale {
    value: u32,
    min: u32,
    max: u32,
    standard: u32,
}

#[tauri::command]
fn get_pet_scale(managed: State<'_, ManagedApp>) -> PetScale {
    PetScale {
        value: managed.runtime.lock().map(|st| st.scale_pct).unwrap_or(DEFAULT_SCALE),
        min: MIN_SCALE,
        max: MAX_SCALE,
        standard: DEFAULT_SCALE,
    }
}

#[tauri::command]
fn set_pet_scale(
    app: AppHandle,
    managed: State<'_, ManagedApp>,
    scale_pct: u32,
    save: bool,
) -> Result<(), String> {
    let pet = app.get_webview_window("main").ok_or("找不到桌宠窗口")?;
    let scale_pct = scale_pct.clamp(MIN_SCALE, MAX_SCALE);
    let changed = {
        let mut state = managed.runtime.lock().map_err(|err| err.to_string())?;
        let changed = state.scale_pct != scale_pct;
        state.scale_pct = scale_pct;
        changed
    };
    if changed {
        resize_anchoring_bottom_right(&pet, scale_pct);
    }
    if save {
        let path = scale_path(&app).map_err(|err| err.to_string())?;
        let dir = path.parent().ok_or("找不到设置目录")?;
        std::fs::create_dir_all(dir).map_err(|err| err.to_string())?;
        std::fs::write(path, scale_pct.to_string()).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn place_window_bottom_right(win: &WebviewWindow, scale_pct: u32) {
    let (lw, lh) = target_logical_size(scale_pct);
    let _ = win.set_size(LogicalSize::new(lw, lh));

    if let Ok(Some(mon)) = win.current_monitor().or_else(|_| win.primary_monitor()) {
        let scale = mon.scale_factor().max(0.5);
        let mon_pos = mon.position();
        let mon_size = mon.size();

        let mon_x = mon_pos.x as f64 / scale;
        let mon_y = mon_pos.y as f64 / scale;
        let mon_w = mon_size.width as f64 / scale;
        let mon_h = mon_size.height as f64 / scale;

        let x = (mon_x + mon_w - lw - 28.0).max(mon_x + 12.0);
        let y = (mon_y + mon_h - lh - 56.0).max(mon_y + 32.0);
        let _ = win.set_position(LogicalPosition::new(x, y));
    }
}

fn resize_anchoring_bottom_right(win: &WebviewWindow, scale_pct: u32) {
    let (new_lw, new_lh) = target_logical_size(scale_pct);
    let scale = win.scale_factor().unwrap_or(1.0).max(0.5);

    if let (Ok(old_pos), Ok(old_size)) = (win.outer_position(), win.outer_size()) {
        let right_phys = old_pos.x + old_size.width as i32;
        let bottom_phys = old_pos.y + old_size.height as i32;

        let new_w_phys = (new_lw * scale).round() as i32;
        let new_h_phys = (new_lh * scale).round() as i32;

        let mut new_x_phys = right_phys - new_w_phys;
        let mut new_y_phys = bottom_phys - new_h_phys;

        if let Ok(Some(mon)) = win.current_monitor().or_else(|_| win.primary_monitor()) {
            let mp = mon.position();
            let ms = mon.size();
            new_x_phys = new_x_phys.clamp(mp.x + 8, (mp.x + ms.width as i32 - new_w_phys - 8).max(mp.x + 8));
            new_y_phys = new_y_phys.clamp(mp.y + 28, (mp.y + ms.height as i32 - new_h_phys - 8).max(mp.y + 28));
        }

        let _ = win.set_size(LogicalSize::new(new_lw, new_lh));
        let _ = win.set_position(PhysicalPosition::new(new_x_phys, new_y_phys));
    } else {
        let _ = win.set_size(LogicalSize::new(new_lw, new_lh));
    }
}

#[tauri::command]
fn show_pet_context_menu(win: WebviewWindow, managed: State<'_, ManagedApp>) -> Result<(), String> {
    if let Some(st) = managed.update_runtime(|st| {
        let now = Instant::now();
        st.pause_passthrough_until = Some(now + Duration::from_millis(650));
        st.roam_pause_until = Some(now + Duration::from_millis(1200));
    }) {
        managed.sync_checkmarks(&st);
    }
    managed.sync_autostart_checkmark();
    let _ = win.set_ignore_cursor_events(false);
    win.popup_menu(&managed.menu).map_err(|e| e.to_string())
}

#[tauri::command]
fn start_pet_drag(win: WebviewWindow, managed: State<'_, ManagedApp>) -> Result<(), String> {
    let locked = managed
        .runtime
        .lock()
        .map(|mut s| {
            s.roam_pause_until = Some(Instant::now() + Duration::from_millis(950));
            s.passthrough_locked
        })
        .unwrap_or(false);
    if locked {
        return Ok(());
    }
    win.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_holding_treat(managed: State<'_, ManagedApp>, holding: bool) {
    let _ = managed.update_runtime(|st| {
        st.holding_treat = holding;
    });
}

#[tauri::command]
fn sync_pet_preferences(
    managed: State<'_, ManagedApp>,
    view: String,
    desk_dir: Option<String>,
    sound_enabled: bool,
    show_popups: bool,
    roam_bark: Option<bool>,
) {
    if let Some(st) = managed.update_runtime(|st| {
        if matches!(view.as_str(), "sunny" | "daisy" | "kuro") {
            st.current_view = view;
        }
        if let Some(dir) = desk_dir {
            if matches!(dir.as_str(), "user" | "dog") {
                st.desk_dir = dir;
            }
        }
        st.sound_enabled = sound_enabled;
        st.show_popups = show_popups;
        if let Some(roam) = roam_bark {
            if roam && !st.roam_bark {
                st.roam_enabled_at = Some(Instant::now());
                st.roam_pause_until = None;
            }
            st.roam_bark = roam;
        }
    }) {
        managed.sync_checkmarks(&st);
    }
}

fn handle_menu_command(app: &AppHandle, id: &str) {
    let Some(managed) = app.try_state::<ManagedApp>() else {
        return;
    };
    let win = app.get_webview_window("main");

    match id {
        "view:sunny" | "view:daisy" | "view:kuro" => {
            let v = &id[5..];
            if let Some(st) = managed.update_runtime(|st| st.current_view = v.into()) {
                managed.sync_checkmarks(&st);
            }
            if let Some(w) = &win {
                let _ = w.show();
            }
            let _ = app.emit(
                "pet-menu-command",
                FrontendMenuPayload {
                    action: "set-view",
                    value: v,
                },
            );
        }
        "feed:bone" | "feed:jerky" | "feed:cheese" => {
            let treat = &id[5..];
            let _ = managed.update_runtime(|st| {
                st.holding_treat = true;
            });
            if let Some(w) = &win {
                let _ = w.show();
            }
            let _ = app.emit(
                "pet-menu-command",
                FrontendMenuPayload {
                    action: "feed",
                    value: treat,
                },
            );
        }
        "action:pet" => {
            let _ = app.emit(
                "pet-menu-command",
                FrontendMenuPayload {
                    action: "pet-head",
                    value: "",
                },
            );
        }
        "action:nap" => {
            if let Some(st) = managed.update_runtime(|st| {
                st.roam_bark = false;
            }) {
                managed.sync_checkmarks(&st);
            }
            let _ = app.emit(
                "pet-menu-command",
                FrontendMenuPayload {
                    action: "nap",
                    value: "",
                },
            );
        }
        "toggle:roam_bark" => {
            if let Some(st) = managed.update_runtime(|st| {
                st.roam_bark = !st.roam_bark;
                if st.roam_bark {
                    st.roam_enabled_at = Some(Instant::now());
                    st.roam_pause_until = None;
                }
            }) {
                let val = if st.roam_bark { "true" } else { "false" };
                managed.sync_checkmarks(&st);
                if st.roam_bark {
                    if let Some(w) = &win {
                        let _ = w.show();
                    }
                }
                let _ = app.emit(
                    "pet-menu-command",
                    FrontendMenuPayload {
                        action: "set-roam-bark",
                        value: val,
                    },
                );
            }
        }
        "action:export" => {
            let _ = app.emit(
                "pet-menu-command",
                FrontendMenuPayload {
                    action: "export-png",
                    value: "",
                },
            );
        }
        "desk:user" | "desk:dog" => {
            let dir = &id[5..];
            if let Some(st) = managed.update_runtime(|st| st.desk_dir = dir.into()) {
                managed.sync_checkmarks(&st);
            }
            let _ = app.emit(
                "pet-menu-command",
                FrontendMenuPayload {
                    action: "set-desk-dir",
                    value: dir,
                },
            );
        }
        "window:size" => {
            let _ = show_size_controls(app);
        }
        "toggle:always_on_top" => {
            if let Some(st) = managed.update_runtime(|st| st.always_on_top = !st.always_on_top) {
                managed.sync_checkmarks(&st);
                if let Some(w) = &win {
                    let _ = w.set_always_on_top(st.always_on_top);
                }
            }
        }
        "toggle:passthrough" => {
            if let Some(st) =
                managed.update_runtime(|st| st.passthrough_locked = !st.passthrough_locked)
            {
                managed.sync_checkmarks(&st);
                if let Some(w) = &win {
                    let _ = w.set_ignore_cursor_events(st.passthrough_locked);
                }
            }
        }
        "toggle:sound" => {
            if let Some(st) = managed.update_runtime(|st| st.sound_enabled = !st.sound_enabled) {
                let val = if st.sound_enabled { "true" } else { "false" };
                managed.sync_checkmarks(&st);
                let _ = app.emit(
                    "pet-menu-command",
                    FrontendMenuPayload {
                        action: "set-sound",
                        value: val,
                    },
                );
            }
        }
        "toggle:popups" => {
            if let Some(st) = managed.update_runtime(|st| st.show_popups = !st.show_popups) {
                let val = if st.show_popups { "true" } else { "false" };
                managed.sync_checkmarks(&st);
                let _ = app.emit(
                    "pet-menu-command",
                    FrontendMenuPayload {
                        action: "set-popups",
                        value: val,
                    },
                );
            }
        }
        "toggle:autostart" => {
            let Some(autostart) = &managed.autostart else {
                return;
            };
            let result = autostart.is_enabled().and_then(|enabled| {
                if enabled {
                    autostart.disable()
                } else {
                    autostart.enable()
                }
            });
            managed.sync_autostart_checkmark();
            if let Err(err) = result {
                eprintln!("更新开机启动设置失败：{err}");
                let _ = app.emit_to("main", "pet-autostart-error", ());
            }
        }
        "window:reset_pos" => {
            let Some(w) = &win else { return };
            let Some(st) = managed.update_runtime(|st| {
                st.passthrough_locked = false;
                st.roam_bark = false;
            }) else {
                return;
            };
            managed.sync_checkmarks(&st);
            let _ = app.emit(
                "pet-menu-command",
                FrontendMenuPayload {
                    action: "set-roam-bark",
                    value: "false",
                },
            );
            let _ = w.show();
            let _ = w.set_ignore_cursor_events(false);
            place_window_bottom_right(w, st.scale_pct);
        }
        "window:perm_help" => {
            #[cfg(target_os = "macos")]
            input_hook::open_input_monitoring_settings();
        }
        "app:quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

fn build_shared_menu(app: &AppHandle) -> tauri::Result<ManagedApp> {
    let runtime = Arc::new(Mutex::new(PetRuntimeState {
        scale_pct: load_pet_scale(app),
        ..PetRuntimeState::default()
    }));

    let view_sunny = CheckMenuItem::with_id(app, "view:sunny", "🕶️ 墨镜金毛", true, false, None::<&str>)?;
    let view_daisy = CheckMenuItem::with_id(app, "view:daisy", "🌼 蓝巾小柴", true, true, None::<&str>)?;
    let view_kuro = CheckMenuItem::with_id(app, "view:kuro", "🖤 歪头黑柴", true, false, None::<&str>)?;

    let feed_bone = MenuItem::with_id(app, "feed:bone", "🦴 喂香脆肉骨头", true, None::<&str>)?;
    let feed_jerky = MenuItem::with_id(app, "feed:jerky", "🥩 喂炭烤小肉干", true, None::<&str>)?;
    let feed_cheese = MenuItem::with_id(app, "feed:cheese", "🧀 喂芝士奶球", true, None::<&str>)?;
    let feed_submenu = Submenu::with_items(
        app,
        "🍖 投喂小零食",
        true,
        &[&feed_bone, &feed_jerky, &feed_cheese],
    )?;

    let act_pet = MenuItem::with_id(app, "action:pet", "💕 摸摸头夸夸", true, None::<&str>)?;
    let act_nap = MenuItem::with_id(app, "action:nap", "💤 哄它犯困吹鼻涕泡", true, None::<&str>)?;
    let chk_roam_bark = CheckMenuItem::with_id(
        app,
        "toggle:roam_bark",
        "🐾 逛吠模式",
        true,
        false,
        None::<&str>,
    )?;

    let desk_dog = CheckMenuItem::with_id(
        app,
        "desk:dog",
        "🐶 面向狗狗（鼠标在左）",
        true,
        true,
        None::<&str>,
    )?;
    let desk_user = CheckMenuItem::with_id(
        app,
        "desk:user",
        "👀 面向主人（鼠标在右）",
        true,
        false,
        None::<&str>,
    )?;
    let desk_submenu = Submenu::with_items(
        app,
        "⌨️ 键鼠朝向",
        true,
        &[&desk_dog, &desk_user],
    )?;

    let size_controls = MenuItem::with_id(app, "window:size", "📐 调节桌宠尺寸…", true, None::<&str>)?;

    let chk_top = CheckMenuItem::with_id(app, "toggle:always_on_top", "📌 置顶显示", true, true, None::<&str>)?;
    let chk_pass = CheckMenuItem::with_id(
        app,
        "toggle:passthrough",
        "🔒 锁定位置（全鼠标穿透）",
        true,
        false,
        None::<&str>,
    )?;
    let chk_sound = CheckMenuItem::with_id(app, "toggle:sound", "🔊 开启互动音效", true, false, None::<&str>)?;
    let chk_popups = CheckMenuItem::with_id(
        app,
        "toggle:popups",
        "⌨️ 显示按键放大气泡",
        true,
        true,
        None::<&str>,
    )?;
    let autostart = if tauri::is_dev() {
        None
    } else {
        build_autostart(app)
            .map_err(|err| eprintln!("初始化开机启动设置失败：{err}"))
            .ok()
    };
    let chk_autostart = CheckMenuItem::with_id(
        app,
        "toggle:autostart",
        "开机启动",
        autostart.is_some(),
        false,
        None::<&str>,
    )?;

    let win_reset = MenuItem::with_id(app, "window:reset_pos", "📍 重置到屏幕右下角", true, None::<&str>)?;
    let act_export = MenuItem::with_id(app, "action:export", "📸 导出透明 PNG", true, None::<&str>)?;
    let perm_help = MenuItem::with_id(
        app,
        "window:perm_help",
        "🔐 输入监控权限…",
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "app:quit", "退出 PengDog 桌宠", true, None::<&str>)?;

    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let sep4 = PredefinedMenuItem::separator(app)?;

    #[cfg(target_os = "macos")]
    let menu = Menu::with_items(
        app,
        &[
            &view_daisy,
            &view_kuro,
            &view_sunny,
            &sep1,
            &feed_submenu,
            &act_pet,
            &act_nap,
            &chk_roam_bark,
            &sep2,
            &desk_submenu,
            &size_controls,
            &chk_top,
            &chk_pass,
            &chk_sound,
            &chk_popups,
            &chk_autostart,
            &sep3,
            &win_reset,
            &act_export,
            &perm_help,
            &sep4,
            &quit_item,
        ],
    )?;

    #[cfg(not(target_os = "macos"))]
    let menu = Menu::with_items(
        app,
        &[
            &view_daisy,
            &view_kuro,
            &view_sunny,
            &sep1,
            &feed_submenu,
            &act_pet,
            &act_nap,
            &chk_roam_bark,
            &sep2,
            &desk_submenu,
            &size_controls,
            &chk_top,
            &chk_pass,
            &chk_sound,
            &chk_popups,
            &chk_autostart,
            &sep3,
            &win_reset,
            &act_export,
            &sep4,
            &quit_item,
        ],
    )?;

    let _ = perm_help; // avoid unused warning on non-macOS

    Ok(ManagedApp {
        runtime,
        menu,
        view_daisy,
        view_kuro,
        view_sunny,
        chk_roam_bark,
        desk_user,
        desk_dog,
        chk_top,
        chk_pass,
        chk_sound,
        chk_popups,
        chk_autostart,
        autostart,
    })
}

struct SimpleRng(u64);

impl SimpleRng {
    fn new() -> Self {
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x9E37_79B9_7F4A_7C15);
        Self(seed | 1)
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    fn next_f64(&mut self) -> f64 {
        ((self.next_u64() >> 11) as f64) / ((1u64 << 53) as f64)
    }

    fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * self.next_f64()
    }
}

enum RoamPhase {
    Pause {
        until: Instant,
        extra_bark_at: Option<Instant>,
    },
    Walk {
        target_x: f64,
        target_y: f64,
        cruise_speed: f64,
        cur_speed: f64,
    },
}

fn spawn_roam_controller(app: AppHandle, state: Arc<Mutex<PetRuntimeState>>) {
    std::thread::spawn(move || {
        let mut rng = SimpleRng::new();
        let mut was_active = false;
        let mut moving = false;
        let mut facing: i8 = 1;
        let mut cur_x: f64 = 0.0;
        let mut cur_y: f64 = 0.0;
        let mut last_phys: (i32, i32) = (i32::MIN, i32::MIN);
        let mut last_tick = Instant::now();
        let mut next_mid_bark = Instant::now();
        let mut phase = RoamPhase::Pause {
            until: Instant::now(),
            extra_bark_at: None,
        };

        let emit_roam = |app: &AppHandle,
                         active: bool,
                         moving: bool,
                         facing: i8,
                         speed: f64,
                         bark: bool,
                         kickoff: bool| {
            let _ = app.emit(
                "pet-roam-state",
                RoamStatePayload {
                    active,
                    moving,
                    facing,
                    speed,
                    bark,
                    kickoff,
                },
            );
        };

        loop {
            let snap = {
                let Ok(guard) = state.lock() else {
                    std::thread::sleep(Duration::from_millis(80));
                    continue;
                };
                (
                    guard.roam_bark,
                    guard.holding_treat,
                    guard.cursor_over_pet,
                    guard.roam_enabled_at,
                    guard.roam_pause_until,
                    guard.pause_passthrough_until,
                )
            };

            let (
                roam_bark,
                holding_treat,
                cursor_over_pet,
                roam_enabled_at,
                roam_pause_until,
                pause_passthrough_until,
            ) = snap;

            if !roam_bark {
                if was_active {
                    was_active = false;
                    moving = false;
                    emit_roam(&app, false, false, facing, 0.0, false, false);
                }
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }

            let Some(win) = app.get_webview_window("main") else {
                break;
            };

            let scale = win.scale_factor().unwrap_or(1.0).max(0.5);
            let Ok(pos) = win.outer_position() else {
                std::thread::sleep(Duration::from_millis(50));
                continue;
            };
            let Ok(size) = win.outer_size() else {
                std::thread::sleep(Duration::from_millis(50));
                continue;
            };

            let win_x = pos.x as f64 / scale;
            let win_y = pos.y as f64 / scale;
            let win_w = size.width as f64 / scale;
            let win_h = size.height as f64 / scale;

            let (min_x, max_x, min_y, max_y) =
                if let Ok(Some(mon)) = win.current_monitor().or_else(|_| win.primary_monitor()) {
                    let mscale = mon.scale_factor().max(0.5);
                    let mp = mon.position();
                    let ms = mon.size();
                    let mx = mp.x as f64 / mscale;
                    let my = mp.y as f64 / mscale;
                    let mw = ms.width as f64 / mscale;
                    let mh = ms.height as f64 / mscale;
                    let left = mx + 14.0;
                    let right = (mx + mw - win_w - 14.0).max(left);
                    let top = my + 38.0;
                    let bottom = (my + mh - win_h - 58.0).max(top);
                    (left, right, top, bottom)
                } else {
                    (win_x, win_x, win_y, win_y)
                };

            let now = Instant::now();

            if !was_active {
                was_active = true;
                cur_x = win_x.clamp(min_x, max_x);
                cur_y = win_y.clamp(min_y, max_y);
                last_phys = (pos.x, pos.y);
                moving = false;
                let mid_x = (min_x + max_x) * 0.5;
                facing = if cur_x >= mid_x { -1 } else { 1 };
                phase = RoamPhase::Pause {
                    until: now + Duration::from_millis(360),
                    extra_bark_at: None,
                };
                next_mid_bark = now + Duration::from_secs_f64(rng.range(2.2, 4.0));
                last_tick = now;
                emit_roam(&app, true, false, facing, 0.0, true, true);
                std::thread::sleep(Duration::from_millis(16));
                continue;
            }

            // Detect external user drag and smoothly adopt the new anchor position.
            if (win_x - cur_x).abs() > 28.0 || (win_y - cur_y).abs() > 28.0 {
                cur_x = win_x.clamp(min_x, max_x);
                cur_y = win_y.clamp(min_y, max_y);
                last_phys = (pos.x, pos.y);
                if moving {
                    moving = false;
                    emit_roam(&app, true, false, facing, 0.0, false, false);
                }
                phase = RoamPhase::Pause {
                    until: now + Duration::from_millis(650),
                    extra_bark_at: None,
                };
                last_tick = now;
                std::thread::sleep(Duration::from_millis(24));
                continue;
            }

            let menu_or_drag_paused = pause_passthrough_until.is_some_and(|t| now < t)
                || roam_pause_until.is_some_and(|t| now < t);
            let hover_grace_elapsed = roam_enabled_at
                .map(|t| now.duration_since(t) >= Duration::from_millis(2000))
                .unwrap_or(true);
            let hover_paused = cursor_over_pet && hover_grace_elapsed;

            if holding_treat || menu_or_drag_paused || hover_paused {
                if moving {
                    moving = false;
                    emit_roam(&app, true, false, facing, 0.0, false, false);
                }
                last_tick = now;
                std::thread::sleep(Duration::from_millis(24));
                continue;
            }

            let dt = now.duration_since(last_tick).as_secs_f64().clamp(0.004, 0.05);
            last_tick = now;

            match &mut phase {
                RoamPhase::Pause {
                    until,
                    extra_bark_at,
                } => {
                    if let Some(t) = *extra_bark_at {
                        if now >= t {
                            *extra_bark_at = None;
                            emit_roam(&app, true, false, facing, 0.0, true, false);
                        }
                    }
                    if now >= *until {
                        // Choose a lively new waypoint across the monitor.
                        let mut best_tx = cur_x;
                        let mut best_ty = cur_y;
                        let mut best_score = -1.0_f64;

                        for _ in 0..8 {
                            let cand_x = rng.range(min_x, max_x);
                            let cand_y = if rng.next_f64() < 0.65 {
                                let lo = min_y + (max_y - min_y) * 0.42;
                                rng.range(lo, max_y)
                            } else {
                                rng.range(min_y, max_y)
                            };
                            let d = (cand_x - cur_x).hypot(cand_y - cur_y);
                            let score = if (220.0..=640.0).contains(&d) {
                                1000.0 + d
                            } else {
                                d
                            };
                            if score > best_score {
                                best_score = score;
                                best_tx = cand_x;
                                best_ty = cand_y;
                            }
                        }

                        if best_tx < cur_x - 8.0 {
                            facing = -1;
                        } else if best_tx > cur_x + 8.0 {
                            facing = 1;
                        }
                        let cruise_speed = rng.range(122.0, 178.0);
                        phase = RoamPhase::Walk {
                            target_x: best_tx,
                            target_y: best_ty,
                            cruise_speed,
                            cur_speed: 38.0,
                        };
                        moving = true;
                        emit_roam(&app, true, true, facing, cruise_speed, false, false);
                    }
                }
                RoamPhase::Walk {
                    target_x,
                    target_y,
                    cruise_speed,
                    cur_speed,
                } => {
                    let dx = *target_x - cur_x;
                    let dy = *target_y - cur_y;
                    let dist = dx.hypot(dy);

                    if dist <= 6.0 {
                        cur_x = *target_x;
                        cur_y = *target_y;
                        let px = (cur_x * scale).round() as i32;
                        let py = (cur_y * scale).round() as i32;
                        if (px, py) != last_phys {
                            let _ = win.set_position(PhysicalPosition::new(px, py));
                            last_phys = (px, py);
                        }
                        moving = false;
                        let should_bark = rng.next_f64() < 0.85;
                        let pause_secs = rng.range(0.95, 2.25);
                        let extra_bark_at = if should_bark && rng.next_f64() < 0.36 {
                            Some(now + Duration::from_secs_f64(rng.range(0.62, 1.05)))
                        } else {
                            None
                        };
                        phase = RoamPhase::Pause {
                            until: now + Duration::from_secs_f64(pause_secs),
                            extra_bark_at,
                        };
                        emit_roam(&app, true, false, facing, 0.0, should_bark, false);
                    } else {
                        let desired_speed = if dist < 88.0 {
                            (*cruise_speed * (dist / 88.0)).max(44.0)
                        } else {
                            *cruise_speed
                        };
                        *cur_speed += (desired_speed - *cur_speed) * (1.0 - (-dt * 8.5).exp());
                        let step = (*cur_speed * dt).min(dist);
                        cur_x = (cur_x + (dx / dist) * step).clamp(min_x, max_x);
                        cur_y = (cur_y + (dy / dist) * step).clamp(min_y, max_y);

                        let px = (cur_x * scale).round() as i32;
                        let py = (cur_y * scale).round() as i32;
                        if (px, py) != last_phys {
                            let _ = win.set_position(PhysicalPosition::new(px, py));
                            last_phys = (px, py);
                        }

                        if !moving {
                            moving = true;
                            emit_roam(&app, true, true, facing, *cur_speed, false, false);
                        }

                        if now >= next_mid_bark {
                            next_mid_bark = now + Duration::from_secs_f64(rng.range(2.6, 5.0));
                            emit_roam(&app, true, true, facing, *cur_speed, true, false);
                        }
                    }
                }
            }

            std::thread::sleep(Duration::from_millis(16));
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            show_pet_context_menu,
            start_pet_drag,
            set_holding_treat,
            sync_pet_preferences,
            get_pet_scale,
            set_pet_scale
        ])
        .on_menu_event(|app, event| {
            handle_menu_command(app, event.id().as_ref());
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                // Live cleanly on Desktop + Top Menu Bar without cluttering the macOS Dock!
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                input_hook::request_input_monitoring();
            }

            let handle = app.handle().clone();
            let managed = build_shared_menu(&handle)?;
            managed.sync_autostart_checkmark();
            let runtime_arc = managed.runtime.clone();

            // Build macOS Top Menu Bar Icon / Windows System Tray Icon with left-click dropdown!
            #[cfg(target_os = "macos")]
            let tray_img = Image::from_bytes(include_bytes!("../icons/tray-template.png"))?;
            #[cfg(not(target_os = "macos"))]
            let tray_img = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

            TrayIconBuilder::with_id("peng-dog-tray")
                .icon(tray_img)
                .icon_as_template(cfg!(target_os = "macos"))
                .tooltip("PengDog 小狗桌宠 · 点击选择功能")
                .menu(&managed.menu)
                .show_menu_on_left_click(true)
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Enter { .. }
                            | TrayIconEvent::Click {
                                button_state: MouseButtonState::Down,
                                ..
                            }
                    ) {
                        if let Some(managed) = tray.app_handle().try_state::<ManagedApp>() {
                            managed.sync_autostart_checkmark();
                        }
                    }
                })
                .build(app)?;

            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_always_on_top(true);
                let scale = runtime_arc.lock().map(|st| st.scale_pct).unwrap_or(DEFAULT_SCALE);
                place_window_bottom_right(&win, scale);
            }

            app.manage(managed);

            // Start passive global keyboard/mouse hook + smart transparent click-through tracker
            input_hook::start_global_input_and_passthrough(handle.clone(), runtime_arc.clone());

            // Start desktop roam & bark patrol controller
            spawn_roam_controller(handle, runtime_arc);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PengDog desktop pet");
}
