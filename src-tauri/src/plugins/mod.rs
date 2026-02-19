// Plugin modules — add your plugin modules here.
//
// Example:
//   pub mod my_plugin;
//   pub use my_plugin::commands::*;
//
// Then register any #[tauri::command] functions in lib.rs's generate_handler![].

pub mod downloader;
pub mod terminal;
