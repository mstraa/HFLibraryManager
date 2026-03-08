use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub library_path: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            library_path: default_library_path(),
        }
    }
}

fn default_library_path() -> String {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join("3dPrintManager")
        .to_string_lossy()
        .to_string()
}

/// Fixed config directory that never moves
fn config_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join(".config")
        .join("3dPrintManager")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

static CONFIG: OnceLock<std::sync::Mutex<AppConfig>> = OnceLock::new();

pub fn load_config() -> AppConfig {
    let path = config_path();
    if path.exists() {
        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str::<AppConfig>(&data) {
                return config;
            }
        }
    }
    AppConfig::default()
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(config_path(), data).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_config() -> AppConfig {
    let mutex = CONFIG.get_or_init(|| {
        std::sync::Mutex::new(load_config())
    });
    mutex.lock().unwrap().clone()
}

pub fn set_library_path(new_path: String) -> Result<(), String> {
    let mutex = CONFIG.get_or_init(|| {
        std::sync::Mutex::new(load_config())
    });
    let mut config = mutex.lock().unwrap();
    config.library_path = new_path;
    save_config(&config)
}

pub fn library_path() -> PathBuf {
    PathBuf::from(&get_config().library_path)
}
