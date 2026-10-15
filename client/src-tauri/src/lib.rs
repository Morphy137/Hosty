use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const PREFERRED_PORT: u16 = 4000;
/// The daemon waits up to its stop timeout (30 s) for Java servers; leave headroom on top.
const SHUTDOWN_GRACE: Duration = Duration::from_secs(45);
const DEV_DAEMON_URL: &str = "http://localhost:4000";

/// 256 random bits as hex; shared only with the sidecar and the UI of this run.
fn generate_api_token() -> Result<String, String> {
  let mut bytes = [0u8; 32];
  getrandom::getrandom(&mut bytes).map_err(|e| e.to_string())?;
  Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

#[derive(Default)]
struct DaemonState {
  url: Mutex<Option<String>>,
  api_token: Mutex<Option<String>>,
  start_error: Mutex<Option<String>>,
  log_dir: Mutex<Option<PathBuf>>,
  child: Mutex<Option<CommandChild>>,
  terminated: Mutex<Option<Receiver<()>>>,
  shutting_down: AtomicBool,
}

/// Prefers the default port and falls back to any free one when it is taken.
fn pick_port() -> u16 {
  if TcpListener::bind(("127.0.0.1", PREFERRED_PORT)).is_ok() {
    return PREFERRED_PORT;
  }
  TcpListener::bind(("127.0.0.1", 0))
    .ok()
    .and_then(|listener| listener.local_addr().ok())
    .map(|addr| addr.port())
    .unwrap_or(PREFERRED_PORT)
}

fn start_daemon(app: &tauri::AppHandle) -> Result<(), String> {
  let state = app.state::<DaemonState>();

  let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
  fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
  *state.log_dir.lock().unwrap() = Some(log_dir.clone());

  // `tauri dev` uses the daemon started by `npm run dev:daemon`, not the bundled sidecar.
  if cfg!(debug_assertions) {
    let url = std::env::var("VITE_DAEMON_URL").unwrap_or_else(|_| DEV_DAEMON_URL.to_string());
    *state.url.lock().unwrap() = Some(url);
    return Ok(());
  }

  let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
  let instance_dir = data_dir.join("instances").join("default");
  let assets_dir = app
    .path()
    .resource_dir()
    .map_err(|e| e.to_string())?
    .join("bridge");
  let games_dir = data_dir.join("games");
  fs::create_dir_all(&games_dir).map_err(|e| e.to_string())?;
  let locales_dir = data_dir.join("locales");
  fs::create_dir_all(&locales_dir).map_err(|e| e.to_string())?;
  let port = pick_port();
  let api_token = generate_api_token()?;

  let (mut rx, child) = app
    .shell()
    .sidecar("hosty-daemon")
    .map_err(|e| e.to_string())?
    .env("NODE_ENV", "production")
    .env("MC_NEXUS_PORT", port.to_string())
    .env("MC_NEXUS_HOST", "127.0.0.1")
    .env("MC_NEXUS_INSTANCE_DIR", instance_dir.to_string_lossy().to_string())
    .env("MC_NEXUS_ASSETS_DIR", assets_dir.to_string_lossy().to_string())
    .env("MC_NEXUS_GAMES_DIR", games_dir.to_string_lossy().to_string())
    .env("MC_NEXUS_LOCALES_DIR", locales_dir.to_string_lossy().to_string())
    .env("MC_NEXUS_PARENT_SUPERVISED", "1")
    .env("MC_NEXUS_API_TOKEN", api_token.clone())
    .spawn()
    .map_err(|e| e.to_string())?;

  *state.url.lock().unwrap() = Some(format!("http://127.0.0.1:{port}"));
  *state.api_token.lock().unwrap() = Some(api_token);
  *state.child.lock().unwrap() = Some(child);

  let (terminated_tx, terminated_rx) = mpsc::channel::<()>();
  *state.terminated.lock().unwrap() = Some(terminated_rx);

  let log_path = log_dir.join("daemon.log");
  tauri::async_runtime::spawn(async move {
    let mut log_file = OpenOptions::new()
      .create(true)
      .write(true)
      .truncate(true)
      .open(&log_path)
      .ok();
    while let Some(event) = rx.recv().await {
      match event {
        CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
          if let Some(file) = log_file.as_mut() {
            let _ = file.write_all(&line);
            let _ = file.write_all(b"\n");
          }
        }
        CommandEvent::Error(message) => {
          if let Some(file) = log_file.as_mut() {
            let _ = writeln!(file, "[sidecar error] {message}");
          }
        }
        CommandEvent::Terminated(payload) => {
          if let Some(file) = log_file.as_mut() {
            let _ = writeln!(file, "[sidecar exited] code={:?}", payload.code);
          }
          let _ = terminated_tx.send(());
          break;
        }
        _ => {}
      }
    }
  });

  Ok(())
}

#[tauri::command]
fn get_daemon_url(state: State<'_, DaemonState>) -> Result<String, String> {
  if let Some(error) = state.start_error.lock().unwrap().clone() {
    return Err(error);
  }
  state
    .url
    .lock()
    .unwrap()
    .clone()
    .ok_or_else(|| "Daemon has not been started".to_string())
}

/// Empty in `tauri dev`, where the daemon is started by hand without authentication.
#[tauri::command]
fn get_daemon_token(state: State<'_, DaemonState>) -> String {
  state.api_token.lock().unwrap().clone().unwrap_or_default()
}

/// Opens an http(s) link in the user's default browser (webview links with target=_blank do nothing).
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
  if !(url.starts_with("https://") || url.starts_with("http://")) {
    return Err("Only http(s) links can be opened".to_string());
  }

  #[cfg(target_os = "windows")]
  let result = std::process::Command::new("explorer").arg(&url).spawn();
  #[cfg(target_os = "macos")]
  let result = std::process::Command::new("open").arg(&url).spawn();
  #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
  let result = std::process::Command::new("xdg-open").arg(&url).spawn();

  result.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_daemon_logs(state: State<'_, DaemonState>) -> Result<(), String> {
  let dir = state
    .log_dir
    .lock()
    .unwrap()
    .clone()
    .ok_or_else(|| "Log directory is not available".to_string())?;

  #[cfg(target_os = "windows")]
  let opener = "explorer";
  #[cfg(target_os = "macos")]
  let opener = "open";
  #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
  let opener = "xdg-open";

  std::process::Command::new(opener)
    .arg(dir)
    .spawn()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Asks the daemon to stop its game servers gracefully, then terminates it and exits the app.
fn shutdown_daemon_and_exit(app: &tauri::AppHandle, api: &tauri::ExitRequestApi) {
  let state = app.state::<DaemonState>();
  if state.shutting_down.swap(true, Ordering::SeqCst) {
    return;
  }

  let child = state.child.lock().unwrap().take();
  let terminated = state.terminated.lock().unwrap().take();
  let Some(mut child) = child else {
    return;
  };

  api.prevent_exit();
  for window in app.webview_windows().values() {
    let _ = window.hide();
  }
  let _ = child.write(b"shutdown\n");

  let handle = app.clone();
  std::thread::spawn(move || {
    if let Some(rx) = terminated {
      let _ = rx.recv_timeout(SHUTDOWN_GRACE);
    }
    let _ = child.kill();
    handle.exit(0);
  });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();

  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
    if let Some(window) = app.get_webview_window("main") {
      let _ = window.unminimize();
      let _ = window.show();
      let _ = window.set_focus();
    }
  }));

  builder
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .manage(DaemonState::default())
    .invoke_handler(tauri::generate_handler![get_daemon_url, get_daemon_token, open_daemon_logs, open_external])
    .setup(|app| {
      #[cfg(desktop)]
      {
        app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
        app.handle().plugin(tauri_plugin_process::init())?;
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      if let Err(error) = start_daemon(app.handle()) {
        log::error!("failed to start daemon: {error}");
        *app.state::<DaemonState>().start_error.lock().unwrap() = Some(error);
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if let RunEvent::ExitRequested { api, .. } = &event {
        shutdown_daemon_and_exit(app, api);
      }
    });
}
