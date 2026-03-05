// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[cfg(debug_assertions)]
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Vreamio.", name)
}

/// Disable WebView2 tracking prevention on Windows to stop
/// "Tracking Prevention blocked access to storage" console spam
/// for third-party image domains (ytimg.com, m.media-amazon.com, etc.)
#[cfg(target_os = "windows")]
fn disable_tracking_prevention(app: &tauri::App) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.with_webview(|wv| {
            unsafe {
                use webview2_com::Microsoft::Web::WebView2::Win32::*;
                use windows_core::Interface;

                let core: ICoreWebView2 = wv.controller().CoreWebView2().unwrap();
                if let Ok(core13) = core.cast::<ICoreWebView2_13>() {
                    if let Ok(profile) = core13.Profile() {
                        if let Ok(profile3) = profile.cast::<ICoreWebView2Profile3>() {
                            let _ = profile3.SetPreferredTrackingPreventionLevel(
                                COREWEBVIEW2_TRACKING_PREVENTION_LEVEL_NONE,
                            );
                        }
                    }
                }
            }
        });
    }
}

#[cfg(not(target_os = "windows"))]
fn disable_tracking_prevention(_app: &tauri::App) {
    // No-op on non-Windows platforms
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_libmpv::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            disable_tracking_prevention(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
