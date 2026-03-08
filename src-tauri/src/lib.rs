mod commands;
mod config;
mod db;
mod models;
mod thumbnails;

use db::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = Database::new().expect("Failed to initialize database");

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp::init_with_config(
            tauri_plugin_mcp::PluginConfig::new("3D Print Manager".to_string())
                .start_socket_server(true)
                .socket_path("/tmp/tauri-mcp.sock".into()),
        ));
    }

    builder
        .manage(database)
        .invoke_handler(tauri::generate_handler![
            // Projects
            commands::create_project,
            commands::get_project,
            commands::update_project,
            commands::delete_project,
            commands::list_projects,
            commands::set_project_thumbnail,
            // Tags
            commands::create_tag,
            commands::list_tags,
            commands::update_tag,
            commands::delete_tag,
            commands::set_project_tags,
            // Creators
            commands::list_creators,
            // Filament & Size filters
            commands::list_all_filaments,
            commands::list_all_sizes,
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
            commands::reveal_in_finder,
            commands::read_text_file,
            commands::sync_project_files,
            commands::export_data,
            commands::get_data_dir,
            commands::get_library_path,
            commands::set_library_path,
            commands::get_storage_sizes,
            commands::empty_trash,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
