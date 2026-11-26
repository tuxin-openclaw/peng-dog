mod input_hook;

use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
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
    pub pause_passthrough_until: Option<Instant>,
}

impl Default for PetRuntimeState {
    fn default() -> Self {
        Self {
            current_view: "sunny".to_string(),
            desk_dir: "dog".to_string(),
            scale_pct: DEFAULT_SCALE,
            always_on_top: true,
            passthrough_locked: false,
            holding_treat: false,
            sound_enabled: false,
            show_popups: true,
            pause_passthrough_until: None,
        }
    }
}

struct ManagedApp {
    runtime: Arc<Mutex<PetRuntimeState>>,
    menu: Menu<Wry>,
    view_sunny: CheckMenuItem<Wry>,
    view_daisy: CheckMenuItem<Wry>,
    view_kuro: CheckMenuItem<Wry>,
    desk_user: CheckMenuItem<Wry>,
    desk_dog: CheckMenuItem<Wry>,
    chk_top: CheckMenuItem<Wry>,
    chk_pass: CheckMenuItem<Wry>,
    chk_sound: CheckMenuItem<Wry>,
    chk_popups: CheckMenuItem<Wry>,
}

impl ManagedApp {
    // Return a snapshot so callers can update native UI after releasing the state lock.
    fn update_runtime(&self, update: impl FnOnce(&mut PetRuntimeState)) -> Option<PetRuntimeState> {
        let mut state = self.runtime.lock().ok()?;
        update(&mut state);
        Some(state.clone())
    }

    fn sync_checkmarks(&self, st: &PetRuntimeState) {
        let _ = self.view_sunny.set_checked(st.current_view == "sunny");
        let _ = self.view_daisy.set_checked(st.current_view == "daisy");
        let _ = self.view_kuro.set_checked(st.current_view == "kuro");

        let _ = self.desk_user.set_checked(st.desk_dir != "dog");
        let _ = self.desk_dog.set_checked(st.desk_dir == "dog");

        let _ = self.chk_top.set_checked(st.always_on_top);
        let _ = self.chk_pass.set_checked(st.passthrough_locked);
        let _ = self.chk_sound.set_checked(st.sound_enabled);
        let _ = self.chk_popups.set_checked(st.show_popups);
    }
}

#[derive(Clone, Serialize)]
struct FrontendMenuPayload<'a> {
    action: &'a str,
    value: &'a str,
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
        st.pause_passthrough_until = Some(Instant::now() + Duration::from_millis(650));
    }) {
        managed.sync_checkmarks(&st);
    }
    let _ = win.set_ignore_cursor_events(false);
    win.popup_menu(&managed.menu).map_err(|e| e.to_string())
}

#[tauri::command]
fn start_pet_drag(win: WebviewWindow, managed: State<'_, ManagedApp>) -> Result<(), String> {
    let locked = managed
        .runtime
        .lock()
        .map(|s| s.passthrough_locked)
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
            let _ = app.emit(
                "pet-menu-command",
                FrontendMenuPayload {
                    action: "nap",
                    value: "",
                },
            );
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
        "window:reset_pos" => {
            let Some(w) = &win else { return };
            let Some(st) = managed.update_runtime(|st| st.passthrough_locked = false) else {
                return;
            };
            managed.sync_checkmarks(&st);
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

    let view_sunny = CheckMenuItem::with_id(app, "view:sunny", "🕶️ 墨镜金毛", true, true, None::<&str>)?;
    let view_daisy = CheckMenuItem::with_id(app, "view:daisy", "🌼 蓝巾小柴", true, false, None::<&str>)?;
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
            &view_sunny,
            &view_daisy,
            &view_kuro,
            &sep1,
            &feed_submenu,
            &act_pet,
            &act_nap,
            &sep2,
            &desk_submenu,
            &size_controls,
            &chk_top,
            &chk_pass,
            &chk_sound,
            &chk_popups,
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
            &view_sunny,
            &view_daisy,
            &view_kuro,
            &sep1,
            &feed_submenu,
            &act_pet,
            &act_nap,
            &sep2,
            &desk_submenu,
            &size_controls,
            &chk_top,
            &chk_pass,
            &chk_sound,
            &chk_popups,
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
        view_sunny,
        view_daisy,
        view_kuro,
        desk_user,
        desk_dog,
        chk_top,
        chk_pass,
        chk_sound,
        chk_popups,
    })
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
                .build(app)?;

            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_always_on_top(true);
                let scale = runtime_arc.lock().map(|st| st.scale_pct).unwrap_or(DEFAULT_SCALE);
                place_window_bottom_right(&win, scale);
            }

            app.manage(managed);

            // Start passive global keyboard/mouse hook + smart transparent click-through tracker
            input_hook::start_global_input_and_passthrough(handle, runtime_arc);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PengDog desktop pet");
}
