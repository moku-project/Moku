use serde::{Deserialize, Serialize};

const REPO: &str = "moku-project/Moku";

#[derive(Serialize, Clone)]
pub struct ReleaseInfo {
    pub tag_name: String,
    pub name: String,
    pub body: String,
    pub published_at: String,
    pub html_url: String,
}

/// Run by restart_app once the bundled server has stopped.
#[cfg(target_os = "windows")]
pub static PENDING_INSTALLER: std::sync::Mutex<Option<std::path::PathBuf>> = std::sync::Mutex::new(None);

#[cfg(target_os = "windows")]
#[derive(Clone, Serialize)]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
pub async fn list_releases() -> Result<Vec<ReleaseInfo>, String> {
    use tauri_plugin_http::reqwest;

    #[derive(Deserialize)]
    struct GhRelease {
        tag_name: String,
        name: Option<String>,
        body: Option<String>,
        published_at: Option<String>,
        html_url: String,
    }

    let client = reqwest::Client::builder()
        .user_agent("Moku")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(format!(
            "https://api.github.com/repos/{REPO}/releases?per_page=30"
        ))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned {}", resp.status()));
    }

    let releases: Vec<GhRelease> =
        serde_json::from_str(&resp.text().await.map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;

    Ok(releases
        .into_iter()
        .map(|r| ReleaseInfo {
            name: r.name.unwrap_or_else(|| r.tag_name.clone()),
            tag_name: r.tag_name,
            body: r.body.unwrap_or_default(),
            published_at: r.published_at.unwrap_or_default(),
            html_url: r.html_url,
        })
        .collect())
}

#[tauri::command]
#[cfg_attr(not(target_os = "windows"), allow(unused_variables))]
pub async fn download_and_install_update(app: tauri::AppHandle, tag: String) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    return Err("Native install is Windows-only; open the GitHub release page instead.".into());

    #[cfg(target_os = "windows")]
    {
        use std::io::Write;
        use tauri::Emitter;
        use tauri_plugin_http::reqwest;

        #[derive(Deserialize)]
        struct Asset {
            name: String,
            browser_download_url: String,
            size: u64,
        }
        #[derive(Deserialize)]
        struct Release {
            assets: Vec<Asset>,
        }

        let client = reqwest::Client::builder()
            .user_agent("Moku")
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get(format!(
                "https://api.github.com/repos/{REPO}/releases/tags/{tag}"
            ))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!(
                "GitHub API returned {} for tag {tag}",
                resp.status()
            ));
        }

        let release: Release = serde_json::from_str(&resp.text().await.map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;

        let suffix = if cfg!(target_arch = "aarch64") { "_arm64-setup.exe" } else { "_x64-setup.exe" };
        let asset = release
            .assets
            .into_iter()
            .find(|a| a.name.ends_with(suffix))
            .ok_or_else(|| format!("No {suffix} asset found in release {tag}"))?;

        let total = (asset.size > 0).then_some(asset.size);

        let mut resp = client
            .get(&asset.browser_download_url)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("Installer download returned {}", resp.status()));
        }

        let tmp_path = std::env::temp_dir().join(&asset.name);
        let mut file = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        let mut downloaded: u64 = 0;

        while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            let _ = app.emit("update-progress", UpdateProgress { downloaded, total });
        }
        drop(file);
        if let Some(total) = total {
            if downloaded != total {
                let _ = std::fs::remove_file(&tmp_path);
                return Err(format!("Installer download incomplete ({downloaded} of {total} bytes)"));
            }
        }

        *PENDING_INSTALLER.lock().map_err(|e| e.to_string())? = Some(tmp_path);
        Ok(())
    }
}
