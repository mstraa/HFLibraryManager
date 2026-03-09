use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LibraryEntry {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    /// Kept for backward compatibility with old single-path configs
    #[serde(default)]
    pub library_path: Option<String>,
    #[serde(default)]
    pub libraries: Vec<LibraryEntry>,
    #[serde(default)]
    pub active_library: usize,
}

impl Default for AppConfig {
    fn default() -> Self {
        let default_path = default_library_path();
        Self {
            library_path: None,
            libraries: vec![LibraryEntry {
                path: default_path,
                name: "Default".to_string(),
            }],
            active_library: 0,
        }
    }
}

fn default_library_path() -> String {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join("HFLibraryManager")
        .to_string_lossy()
        .to_string()
}

/// Fixed config directory that never moves
fn config_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join(".config")
        .join("HFLibraryManager")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

static CONFIG: OnceLock<std::sync::Mutex<AppConfig>> = OnceLock::new();

pub fn load_config() -> AppConfig {
    let path = config_path();
    if path.exists() {
        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(mut config) = serde_json::from_str::<AppConfig>(&data) {
                // Migrate old single library_path to libraries list
                if config.libraries.is_empty() {
                    let old_path = config.library_path.clone()
                        .unwrap_or_else(default_library_path);
                    config.libraries.push(LibraryEntry {
                        path: old_path,
                        name: "Default".to_string(),
                    });
                    config.active_library = 0;
                    config.library_path = None;
                    let _ = save_config(&config);
                }
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

pub fn reload_config() {
    let mutex = CONFIG.get_or_init(|| {
        std::sync::Mutex::new(load_config())
    });
    let mut config = mutex.lock().unwrap();
    *config = load_config();
}

fn update_config<F: FnOnce(&mut AppConfig)>(f: F) -> Result<(), String> {
    let mutex = CONFIG.get_or_init(|| {
        std::sync::Mutex::new(load_config())
    });
    let mut config = mutex.lock().unwrap();
    f(&mut config);
    save_config(&config)
}

pub fn set_library_path(new_path: String) -> Result<(), String> {
    update_config(|config| {
        if let Some(entry) = config.libraries.get_mut(config.active_library) {
            entry.path = new_path;
        }
    })
}

pub fn is_first_launch() -> bool {
    !config_path().exists()
}

pub fn library_path() -> PathBuf {
    let config = get_config();
    let idx = config.active_library.min(config.libraries.len().saturating_sub(1));
    PathBuf::from(&config.libraries[idx].path)
}

pub fn get_libraries() -> (Vec<LibraryEntry>, usize) {
    let config = get_config();
    (config.libraries.clone(), config.active_library)
}

pub fn add_library(name: String, path: String) -> Result<(), String> {
    update_config(|config| {
        config.libraries.push(LibraryEntry { path, name });
    })
}

pub fn remove_library(index: usize) -> Result<(), String> {
    update_config(|config| {
        if config.libraries.len() <= 1 {
            return; // Don't remove the last library
        }
        if index < config.libraries.len() {
            config.libraries.remove(index);
            // Adjust active index
            if config.active_library >= config.libraries.len() {
                config.active_library = config.libraries.len() - 1;
            }
        }
    })
}

pub fn switch_library(index: usize) -> Result<(), String> {
    update_config(|config| {
        if index < config.libraries.len() {
            config.active_library = index;
        }
    })
}

pub fn rename_library(index: usize, name: String) -> Result<(), String> {
    update_config(|config| {
        if let Some(entry) = config.libraries.get_mut(index) {
            entry.name = name;
        }
    })
}

// ── Filament Substitutions ──

/// Format: { "color|brand|name" => "color|brand|name" }
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct SubstitutionsFile {
    #[serde(default)]
    substitutions: HashMap<String, String>,
}

static SUBSTITUTIONS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn substitutions_path() -> PathBuf {
    config_dir().join("filament_substitutions.json")
}

fn load_substitutions_from_disk() -> HashMap<String, String> {
    let path = substitutions_path();
    if path.exists() {
        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(file) = serde_json::from_str::<SubstitutionsFile>(&data) {
                return file.substitutions;
            }
        }
    }
    HashMap::new()
}

fn save_substitutions_to_disk(map: &HashMap<String, String>) -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = SubstitutionsFile { substitutions: map.clone() };
    let data = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(substitutions_path(), data).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_substitutions() -> HashMap<String, String> {
    let mutex = SUBSTITUTIONS.get_or_init(|| Mutex::new(load_substitutions_from_disk()));
    mutex.lock().unwrap().clone()
}

pub fn set_substitution(from_key: String, to_key: Option<String>) -> Result<(), String> {
    let mutex = SUBSTITUTIONS.get_or_init(|| Mutex::new(load_substitutions_from_disk()));
    let mut map = mutex.lock().unwrap();
    match to_key {
        Some(target) => { map.insert(from_key, target); }
        None => { map.remove(&from_key); }
    }
    save_substitutions_to_disk(&map)
}

/// Resolve a filament key through the substitution chain (transitive).
/// Returns the final resolved key, or the input key if no substitution.
pub fn resolve_filament_key(key: &str, map: &HashMap<String, String>) -> String {
    let mut current = key.to_string();
    for _ in 0..10 {
        match map.get(&current) {
            Some(next) if next != &current => current = next.clone(),
            _ => break,
        }
    }
    current
}

/// Build a reverse map: for each target key, collect all source keys that resolve to it.
pub fn build_reverse_substitution_map(map: &HashMap<String, String>) -> HashMap<String, Vec<String>> {
    let mut reverse: HashMap<String, Vec<String>> = HashMap::new();
    for source_key in map.keys() {
        let resolved = resolve_filament_key(source_key, map);
        if resolved != *source_key {
            reverse.entry(resolved).or_default().push(source_key.clone());
        }
    }
    reverse
}

pub fn filament_key(color: &str, brand: &str, name: &str) -> String {
    format!("{}|{}|{}", color.to_lowercase(), brand, name)
}

pub fn parse_filament_key(key: &str) -> (String, String, String) {
    let parts: Vec<&str> = key.splitn(3, '|').collect();
    match parts.len() {
        3 => (parts[0].to_string(), parts[1].to_string(), parts[2].to_string()),
        2 => (parts[0].to_string(), parts[1].to_string(), String::new()),
        _ => (key.to_string(), String::new(), String::new()),
    }
}
