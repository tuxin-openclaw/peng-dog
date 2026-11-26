mod input_hook;

use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, State,
    WebviewWindow, Wry,
};

pub struct PetRuntimeState {
    pub current_view: String,
    pub desk_dir: String,
    pub scale_pct: u32,
    pub always_on_top: bool,
    pub passthrough_locked: bool,
    pub sound_enabled: bool,
    pub show_popups: bool,
    pub pause_passthrough_until: Option<Instant>,
}

impl Default for PetRuntimeState {
    fn default() -> Self {
        Self {
            current_view: "sunny".to_string(),
            desk_dir: "user".to_string(),
            scale_pct: 100,
            always_on_top: true,
            passthrough_locked: false,
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
    view_all: CheckMenuItem<Wry>,
    desk_user: CheckMenuItem<Wry>,
    desk_dog: CheckMenuItem<Wry>,
    scale_75: CheckMenuItem<Wry>,
    scale_100: CheckMenuItem<Wry>,
    scale_130: CheckMenuItem<Wry>,
    chk_top: CheckMenuItem<Wry>,
    chk_pass: CheckMenuItem<Wry>,
    chk_sound: CheckMenuItem<Wry>,
    chk_popups: CheckMenuItem<Wry>,
}

impl ManagedApp {
    fn sync_checkmarks(&self, st: &PetRuntimeState) {
        let _ = self.view_sunny.set_checked(st.current_view == "sunny");
        let _ = self.view_daisy.set_checked(st.current_view == "daisy");
        let _ = self.view_kuro.set_checked(st.current_view == "kuro");
        let _ = self.view_all.set_checked(st.current_view == "all");

        let _ = self.desk_user.set_checked(st.desk_dir != "dog");
        let _ = self.desk_dog.set_checked(st.desk_dir == "dog");

        let _ = self.scale_75.set_checked(st.scale_pct == 75);
        let _ = self.scale_100.set_checked(st.scale_pct == 100);
        let _ = self.scale_130.set_checked(st.scale_pct == 130);

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

fn target_logical_size(view: &str, scale_pct: u32) -> (f64, f64) {
    let s = (scale_pct as f64 / 100.0).clamp(0.6, 1.6);
    if view == "all" {
        (960.0 * s, 405.0 * s)
    } else {
        (385.0 * s, 455.0 * s)
    }
}

fn place_window_bottom_right(win: &WebviewWindow, view: &str, scale_pct: u32) {
    let (lw, lh) = target_logical_size(view, scale_pct);
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

fn resize_anchoring_bottom_right(win: &WebviewWindow, view: &str, scale_pct: u32) {
    let (new_lw, new_lh) = target_logical_size(view, scale_pct);
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
    if let Ok(mut st) = managed.runtime.lock() {
        st.pause_passthrough_until = Some(Instant::now() + Duration::from_millis(650));
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
fn sync_pet_preferences(
    app: AppHandle,
    managed: State<'_, ManagedApp>,
    view: String,
    desk_dir: Option<String>,
    sound_enabled: bool,
    show_popups: bool,
) {
    if let Ok(mut st) = managed.runtime.lock() {
        if matches!(view.as_str(), "sunny" | "daisy" | "kuro" | "all") && st.current_view != view {
            st.current_view = view.clone();
            if let Some(win) = app.get_webview_window("main") {
                resize_anchoring_bottom_right(&win, &st.current_view, st.scale_pct);
            }
        }
        if let Some(dir) = desk_dir {
            if matches!(dir.as_str(), "user" | "dog") {
                st.desk_dir = dir;
            }
        }
        st.sound_enabled = sound_enabled;
        st.show_popups = show_popups;
        managed.sync_checkmarks(&st);
    }
}

fn handle_menu_command(app: &AppHandle, id: &str) {
    let Some(managed) = app.try_state::<ManagedApp>() else {
        return;
    };
    let win = app.get_webview_window("main");

    match id {
        "view:sunny" | "view:daisy" | "view:kuro" | "view:all" => {
            let v = &id[5..];
            let scale_pct = if let Ok(mut st) = managed.runtime.lock() {
                st.current_view = v.to_string();
                managed.sync_checkmarks(&st);
                st.scale_pct
            } else {
                100
            };
            if let Some(w) = &win {
                let _ = w.show();
                resize_anchoring_bottom_right(w, v, scale_pct);
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
            if let Ok(mut st) = managed.runtime.lock() {
                st.desk_dir = dir.to_string();
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
        "scale:75" | "scale:100" | "scale:130" => {
            let pct: u32 = id[6..].parse().unwrap_or(100);
            let view = if let Ok(mut st) = managed.runtime.lock() {
                st.scale_pct = pct;
                managed.sync_checkmarks(&st);
                st.current_view.clone()
            } else {
                "sunny".to_string()
            };
            if let Some(w) = &win {
                resize_anchoring_bottom_right(w, &view, pct);
            }
        }
        "toggle:always_on_top" => {
            if let Ok(mut st) = managed.runtime.lock() {
                st.always_on_top = !st.always_on_top;
                managed.sync_checkmarks(&st);
                if let Some(w) = &win {
                    let _ = w.set_always_on_top(st.always_on_top);
                }
            }
        }
        "toggle:passthrough" => {
            if let Ok(mut st) = managed.runtime.lock() {
                st.passthrough_locked = !st.passthrough_locked;
                managed.sync_checkmarks(&st);
                if let Some(w) = &win {
                    let _ = w.set_ignore_cursor_events(st.passthrough_locked);
                }
            }
        }
        "toggle:sound" => {
            if let Ok(mut st) = managed.runtime.lock() {
                st.sound_enabled = !st.sound_enabled;
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
            if let Ok(mut st) = managed.runtime.lock() {
                st.show_popups = !st.show_popups;
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
            if let (Some(w), Ok(mut st)) = (&win, managed.runtime.lock()) {
                st.passthrough_locked = false;
                managed.sync_checkmarks(&st);
                let _ = w.show();
                let _ = w.set_ignore_cursor_events(false);
                place_window_bottom_right(w, &st.current_view, st.scale_pct);
            }
        }
        "window:perm_help" => {
            let _ = input_hook::is_accessibility_trusted(true);
        }
        "app:quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

fn build_shared_menu(app: &AppHandle) -> tauri::Result<ManagedApp> {
    let runtime = Arc::new(Mutex::new(PetRuntimeState::default()));

    let view_sunny = CheckMenuItem::with_id(app, "view:sunny", "🕶️ 墨镜金毛", true, true, None::<&str>)?;
    let view_daisy = CheckMenuItem::with_id(app, "view:daisy", "🌼 蓝巾小柴", true, false, None::<&str>)?;
    let view_kuro = CheckMenuItem::with_id(app, "view:kuro", "🖤 歪头黑柴", true, false, None::<&str>)?;
    let view_all = CheckMenuItem::with_id(app, "view:all", "🐾 三只同框", true, false, None::<&str>)?;

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

    let desk_user = CheckMenuItem::with_id(
        app,
        "desk:user",
        "👀 面向用户（鼠标在右）",
        true,
        true,
        None::<&str>,
    )?;
    let desk_dog = CheckMenuItem::with_id(
        app,
        "desk:dog",
        "🐶 面向狗狗（鼠标在左）",
        true,
        false,
        None::<&str>,
    )?;
    let desk_submenu = Submenu::with_items(
        app,
        "⌨️ 键鼠朝向",
        true,
        &[&desk_user, &desk_dog],
    )?;

    let scale_75 = CheckMenuItem::with_id(app, "scale:75", "小巧 (75%)", true, false, None::<&str>)?;
    let scale_100 = CheckMenuItem::with_id(app, "scale:100", "标准 (100%)", true, true, None::<&str>)?;
    let scale_130 = CheckMenuItem::with_id(app, "scale:130", "放大 (130%)", true, false, None::<&str>)?;
    let scale_submenu = Submenu::with_items(
        app,
        "📐 桌宠尺寸",
        true,
        &[&scale_75, &scale_100, &scale_130],
    )?;

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
        "🔐 开启全局键鼠监听权限…",
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
            &view_all,
            &sep1,
            &feed_submenu,
            &act_pet,
            &act_nap,
            &sep2,
            &desk_submenu,
            &scale_submenu,
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
            &view_all,
            &sep1,
            &feed_submenu,
            &act_pet,
            &act_nap,
            &sep2,
            &desk_submenu,
            &scale_submenu,
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
        view_all,
        desk_user,
        desk_dog,
        scale_75,
        scale_100,
        scale_130,
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
            sync_pet_preferences
        ])
        .on_menu_event(|app, event| {
            handle_menu_command(app, event.id().as_ref());
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                // Live cleanly on Desktop + Top Menu Bar without cluttering the macOS Dock!
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                // Prompt once on first launch if Accessibility / Input Monitoring is not enabled yet
                let _ = input_hook::is_accessibility_trusted(true);
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
                place_window_bottom_right(&win, "sunny", 100);
            }

            app.manage(managed);

            // Start passive global keyboard/mouse hook + smart transparent click-through tracker
            input_hook::start_global_input_and_passthrough(handle, runtime_arc);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PengDog desktop pet");
}
