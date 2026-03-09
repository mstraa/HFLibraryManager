mod commands;
mod config;
mod db;
mod models;
mod thumbnails;

use db::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = Database::new();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .manage(database)
        .invoke_handler(tauri::generate_handler![
            // Projects
            commands::create_project,
            commands::get_project,
            commands::update_project,
            commands::delete_project,
            commands::duplicate_project,
            commands::list_projects,
            commands::set_project_thumbnail,
            // Tags
            commands::create_tag,
            commands::list_tags,
            commands::update_tag,
            commands::delete_tag,
            commands::set_project_tags,
            // Filament & Size filters
            commands::list_all_filaments,
            commands::list_all_sizes,
            commands::list_all_filaments_raw,
            commands::get_filament_substitutions,
            commands::set_filament_substitution,
            // Collections
            commands::create_collection,
            commands::list_collections,
            commands::update_collection,
            commands::delete_collection,
            commands::add_project_to_collection,
            commands::remove_project_from_collection,
            // Files
            commands::get_project_files,
            commands::import_files,
            commands::list_folder_files,
            commands::delete_file,
            commands::update_file_notes,
            commands::toggle_file_favorite,
            commands::open_file_in_default_app,
            commands::open_file_with_app,
            commands::reveal_in_finder,
            commands::read_text_file,
            commands::sync_project_files,
            commands::export_data,
            commands::get_data_dir,
            commands::is_first_launch,
            commands::setup_library,
            commands::get_library_path,
            commands::set_library_path,
            commands::get_libraries,
            commands::add_library,
            commands::remove_library,
            commands::switch_library,
            commands::rename_library,
            commands::get_storage_sizes,
            commands::empty_trash,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
