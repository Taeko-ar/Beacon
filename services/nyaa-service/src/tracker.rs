use crate::db::Db;
use crate::nyaa::NyaaRelease;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackedShow {
    pub id: String,
    pub title: String,
    #[serde(rename = "subgroup")]
    pub preferred_subgroup: Option<String>,
    #[serde(rename = "resolution")]
    pub preferred_resolution: Option<String>,
    #[serde(rename = "lastDownloaded")]
    pub last_downloaded_episode: u32,
}

#[derive(Clone)]
pub struct TrackerStore {
    db: Db,
}

impl Default for TrackerStore {
    fn default() -> Self {
        Self::new()
    }
}

impl TrackerStore {
    pub fn new() -> Self {
        let db_path = std::env::var("SQLITE_DB_PATH")
            .ok()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from("anime.db"));
        Self::new_with_path(db_path)
    }

    pub fn with_db(db: Db) -> Self {
        Self { db }
    }

    pub fn with_file_path(file_path: Option<std::path::PathBuf>) -> Self {
        match file_path {
            Some(p) => Self::new_with_path(p),
            None => Self::with_db(Db::in_memory()),
        }
    }

    pub fn new_with_path(path: std::path::PathBuf) -> Self {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                let _ = std::fs::create_dir_all(parent);
            }
        }
        let db = Db::new(&path).unwrap_or_else(|_| Db::in_memory());
        Self { db }
    }

    pub fn db(&self) -> &Db {
        &self.db
    }

    pub fn list(&self) -> Vec<TrackedShow> {
        self.db.list_tracked()
    }

    pub fn add(&self, show: TrackedShow) {
        self.db.add_tracked(&show);
    }

    pub fn remove(&self, id: &str) -> bool {
        self.db.remove_tracked(id)
    }

    pub fn is_match(&self, release: &NyaaRelease, show: &TrackedShow) -> bool {
        if !release
            .title
            .to_lowercase()
            .contains(&show.title.to_lowercase())
        {
            return false;
        }

        if let Some(ref group) = show.preferred_subgroup {
            let matches = release
                .subgroup
                .as_ref()
                .map(|s| s.eq_ignore_ascii_case(group))
                .unwrap_or(false);
            if !matches {
                return false;
            }
        }

        if let Some(ref res) = show.preferred_resolution {
            let matches = release
                .resolution
                .as_ref()
                .map(|s| s.eq_ignore_ascii_case(res))
                .unwrap_or(false);
            if !matches {
                return false;
            }
        }

        if let Some(ref ep) = release.episode {
            if *ep <= show.last_downloaded_episode {
                return false;
            }
        }

        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tracker_store_crud() {
        let store = TrackerStore::with_file_path(None);
        assert_eq!(store.list().len(), 0);

        let show = TrackedShow {
            id: "frieren".to_string(),
            title: "Frieren".to_string(),
            preferred_subgroup: Some("SubsPlease".to_string()),
            preferred_resolution: Some("1080p".to_string()),
            last_downloaded_episode: 4,
        };

        store.add(show.clone());
        assert_eq!(store.list().len(), 1);

        // Update show with same ID
        store.add(show.clone());
        assert_eq!(store.list().len(), 1);

        // Remove show
        assert!(store.remove("frieren"));
        assert_eq!(store.list().len(), 0);
        assert!(!store.remove("nonexistent"));
    }

    #[test]
    fn test_tracker_store_matching_branches() {
        let store = TrackerStore::new();
        let show = TrackedShow {
            id: "frieren".to_string(),
            title: "Frieren".to_string(),
            preferred_subgroup: Some("SubsPlease".to_string()),
            preferred_resolution: Some("1080p".to_string()),
            last_downloaded_episode: 4,
        };

        let release_match = NyaaRelease {
            title: "[SubsPlease] Frieren - 05 (1080p) [ABCD1234].mkv".to_string(),
            magnet_link: "magnet:test".to_string(),
            subgroup: Some("SubsPlease".to_string()),
            resolution: Some("1080p".to_string()),
            episode: Some(5),
        };

        let release_title_mismatch = NyaaRelease {
            title: "Jujutsu Kaisen - 05".to_string(),
            ..release_match.clone()
        };

        let release_subgroup_mismatch = NyaaRelease {
            subgroup: Some("Erai-raws".to_string()),
            ..release_match.clone()
        };

        let release_no_ep = NyaaRelease {
            episode: None,
            ..release_match.clone()
        };

        let show_no_subgroup = TrackedShow {
            preferred_subgroup: None,
            ..show.clone()
        };

        let release_old_ep = NyaaRelease {
            episode: Some(3),
            ..release_match.clone()
        };

        let release_res_mismatch = NyaaRelease {
            resolution: Some("720p".to_string()),
            ..release_match.clone()
        };

        let show_no_res = TrackedShow {
            preferred_resolution: None,
            ..show.clone()
        };

        let release_no_subgroup = NyaaRelease {
            subgroup: None,
            ..release_match.clone()
        };

        assert!(!store.is_match(&release_title_mismatch, &show));
        assert!(!store.is_match(&release_subgroup_mismatch, &show));
        assert!(!store.is_match(&release_no_subgroup, &show));
        assert!(!store.is_match(&release_res_mismatch, &show));
        assert!(!store.is_match(&release_old_ep, &show));
        assert!(store.is_match(&release_no_ep, &show));
        assert!(store.is_match(&release_match, &show_no_subgroup));
        assert!(store.is_match(&release_match, &show_no_res));
    }

    #[test]
    fn test_tracker_store_file_persistence() {
        let temp_dir = tempfile::tempdir().unwrap();
        let file_path = temp_dir.path().join("anime_test.db");

        let store = TrackerStore::new_with_path(file_path.clone());
        assert_eq!(store.list().len(), 0);

        let show = TrackedShow {
            id: "solo".to_string(),
            title: "Solo Leveling".to_string(),
            preferred_subgroup: None,
            preferred_resolution: None,
            last_downloaded_episode: 1,
        };

        store.add(show.clone());
        assert_eq!(store.list().len(), 1);

        // Load from persisted sqlite db file
        let store2 = TrackerStore::new_with_path(file_path.clone());
        assert_eq!(store2.list().len(), 1);

        assert!(store2.remove("solo"));
        assert_eq!(store2.list().len(), 0);
        assert!(!store2.remove("non-existent"));
    }

    #[test]
    #[serial_test::serial]
    fn test_tracker_store_env_var_and_in_memory() {
        let temp_dir = tempfile::tempdir().unwrap();
        let file_path = temp_dir.path().join("env_anime.db");
        std::env::set_var("SQLITE_DB_PATH", file_path.to_str().unwrap());

        let store_env = TrackerStore::new();
        assert_eq!(store_env.list().len(), 0);
        std::env::remove_var("SQLITE_DB_PATH");

        let store_mem = TrackerStore::with_file_path(None);
        let show = TrackedShow {
            id: "mem".to_string(),
            title: "Memory Show".to_string(),
            preferred_subgroup: Some("Group".to_string()),
            preferred_resolution: Some("1080p".to_string()),
            last_downloaded_episode: 0,
        };
        store_mem.add(show.clone());
        assert_eq!(store_mem.list().len(), 1);

        // Replace existing show
        let show_updated = TrackedShow {
            title: "Memory Show Updated".to_string(),
            ..show.clone()
        };
        store_mem.add(show_updated);
        assert_eq!(store_mem.list().len(), 1);

        assert!(store_mem.remove("mem"));
        assert!(!store_mem.remove("mem"));

        let store_def = TrackerStore::default();
        let _ = store_def.list();
        let _ = store_def.db();

        let nested = temp_dir.path().join("nested_path/anime.db");
        let store_nested = TrackerStore::new_with_path(nested);
        assert_eq!(store_nested.list().len(), 0);

        let store_dir_fallback = TrackerStore::new_with_path(temp_dir.path().to_path_buf());
        assert_eq!(store_dir_fallback.list().len(), 0);

        let show = TrackedShow {
            id: "d".to_string(),
            title: "t".to_string(),
            preferred_subgroup: Some("s".to_string()),
            preferred_resolution: Some("r".to_string()),
            last_downloaded_episode: 1,
        };
        let _ = show.clone();
        let _ = format!("{:?}", show);
        let s_show = serde_json::to_string(&show).unwrap();
        let _: TrackedShow = serde_json::from_str(&s_show).unwrap();
    }

    #[test]
    fn test_with_file_path_some_variant() {
        let temp_dir = tempfile::tempdir().unwrap();
        let file_path = temp_dir.path().join("via_with_file_path.db");
        let store = TrackerStore::with_file_path(Some(file_path.clone()));
        assert_eq!(store.list().len(), 0);
        let show = TrackedShow {
            id: "wfp".to_string(),
            title: "Via With File Path".to_string(),
            preferred_subgroup: None,
            preferred_resolution: None,
            last_downloaded_episode: 0,
        };
        store.add(show);
        assert_eq!(store.list().len(), 1);
        assert!(file_path.exists());
    }

    #[test]
    fn test_new_with_path_no_parent() {
        let store = TrackerStore::new_with_path(std::path::PathBuf::new());
        assert_eq!(store.list().len(), 0);
    }

    #[test]
    fn test_tracker_store_case_insensitive_matching() {
        let store = TrackerStore::with_file_path(None);
        let show = TrackedShow {
            id: "frieren".to_string(),
            title: "Frieren".to_string(),
            preferred_subgroup: Some("subsplease".to_string()),
            preferred_resolution: Some("1080P".to_string()),
            last_downloaded_episode: 0,
        };
        let release = NyaaRelease {
            title: "[SubsPlease] Frieren - 05 (1080p) [ABCD1234].mkv".to_string(),
            magnet_link: "magnet:test".to_string(),
            subgroup: Some("SubsPlease".to_string()),
            resolution: Some("1080p".to_string()),
            episode: Some(5),
        };
        assert!(store.is_match(&release, &show));
    }
}
