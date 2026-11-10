use std::path::PathBuf;

#[derive(serde::Serialize)]
pub struct PickedFile {
    name: String,
    bytes: Vec<u8>,
}

#[tauri::command]
pub async fn pick_extension_file(app: tauri::AppHandle) -> Result<PickedFile, String> {
    use tauri_plugin_dialog::DialogExt;

    let path = app
        .dialog()
        .file()
        .set_title("Install extension from file")
        .add_filter("Extension", &["apk", "jar", "js"])
        .blocking_pick_file()
        .ok_or("Cancelled")?;

    let path = PathBuf::from(path.to_string());
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(PickedFile { name, bytes })
}
