mod commands;
mod db;
mod models;
mod thumbnails;

use db::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = Database::new().expect("Failed to initialize database");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            // Collections
            commands::create_collection,
            commands::list_collections,
            commands::update_collection,
            commands::delete_collection,
            commands::add_project_to_collection,
            commands::remove_project_from_collection,
            // Assets & Revisions
            commands::get_project_assets,
            commands::import_file,
            commands::delete_revision,
            commands::open_file_in_default_app,
            commands::update_revision_notes,
            commands::set_revision_thumbnail,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
