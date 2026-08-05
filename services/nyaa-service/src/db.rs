use crate::calendar::{CacheEntry, CalendarEvent};
use crate::tracker::TrackedShow;
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    pub fn new(path: impl AsRef<Path>) -> Result<Self, String> {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;

        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             CREATE TABLE IF NOT EXISTS tracked_shows (
                 id TEXT PRIMARY KEY,
                 title TEXT NOT NULL,
                 subgroup TEXT,
                 resolution TEXT,
                 last_downloaded INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE IF NOT EXISTS calendar_cache (
                 key TEXT PRIMARY KEY,
                 cached_at INTEGER NOT NULL,
                 data TEXT NOT NULL
             );",
        )
        .unwrap();

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn in_memory() -> Self {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS tracked_shows (
                 id TEXT PRIMARY KEY,
                 title TEXT NOT NULL,
                 subgroup TEXT,
                 resolution TEXT,
                 last_downloaded INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE IF NOT EXISTS calendar_cache (
                 key TEXT PRIMARY KEY,
                 cached_at INTEGER NOT NULL,
                 data TEXT NOT NULL
             );",
        )
        .unwrap();

        Self {
            conn: Arc::new(Mutex::new(conn)),
        }
    }

    pub fn list_tracked(&self) -> Vec<TrackedShow> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = match conn
            .prepare("SELECT id, title, subgroup, resolution, last_downloaded FROM tracked_shows")
        {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };

        stmt.query_map([], |row| {
            Ok(TrackedShow {
                id: row.get(0)?,
                title: row.get(1)?,
                preferred_subgroup: row.get(2)?,
                preferred_resolution: row.get(3)?,
                last_downloaded_episode: row.get::<_, u32>(4)?,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    }

    pub fn add_tracked(&self, show: &TrackedShow) -> bool {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let res = conn.execute(
            "INSERT INTO tracked_shows (id, title, subgroup, resolution, last_downloaded)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                 title = excluded.title,
                 subgroup = excluded.subgroup,
                 resolution = excluded.resolution,
                 last_downloaded = excluded.last_downloaded",
            params![
                show.id,
                show.title,
                show.preferred_subgroup,
                show.preferred_resolution,
                show.last_downloaded_episode,
            ],
        );
        res.is_ok()
    }

    pub fn remove_tracked(&self, id: &str) -> bool {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let lower_id = id.to_lowercase();
        match conn.execute(
            "DELETE FROM tracked_shows WHERE id = ?1 OR LOWER(id) = ?2 OR LOWER(title) = ?2",
            params![id, lower_id],
        ) {
            Ok(count) => count > 0,
            Err(_) => false,
        }
    }

    pub fn get_calendar_cache(&self, key: &str) -> Option<CacheEntry> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn
            .prepare("SELECT cached_at, data FROM calendar_cache WHERE key = ?1")
            .ok()?;
        let mut rows = stmt.query(params![key]).unwrap();

        if let Ok(Some(row)) = rows.next() {
            let cached_at: i64 = row.get(0).ok()?;
            let data_str: String = row.get(1).ok()?;
            let events: Vec<CalendarEvent> = serde_json::from_str(&data_str).ok()?;
            Some(CacheEntry { cached_at, events })
        } else {
            None
        }
    }

    pub fn save_calendar_cache(&self, key: &str, cached_at: i64, events: &[CalendarEvent]) {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let data_str = serde_json::to_string(events).unwrap();

        let _ = conn.execute(
            "INSERT INTO calendar_cache (key, cached_at, data)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET
                 cached_at = excluded.cached_at,
                 data = excluded.data",
            params![key, cached_at, data_str],
        );
    }

    pub fn clear_calendar_cache(&self) {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let _ = conn.execute("DELETE FROM calendar_cache", []);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_db_tracked_shows() {
        let db = Db::in_memory();
        let show = TrackedShow {
            id: "show-1".to_string(),
            title: "Test Show".to_string(),
            preferred_subgroup: Some("SubsPlease".to_string()),
            preferred_resolution: Some("1080p".to_string()),
            last_downloaded_episode: 1,
        };

        assert!(db.add_tracked(&show));
        assert!(db.list_tracked().iter().any(|s| s.id == "show-1"));

        assert!(db.remove_tracked("show-1"));
        assert!(!db.remove_tracked("show-1"));
    }

    #[test]
    fn test_db_calendar_cache() {
        let db = Db::in_memory();
        let ev = CalendarEvent {
            id: 1,
            media_id: 1,
            title: "t".to_string(),
            title_romaji: None,
            title_english: None,
            airing_at: 1,
            airing_at_art: "a".to_string(),
            release_date: "d".to_string(),
            episode: 1,
            description: None,
            tags: vec![],
            cover_image: None,
            banner_image: None,
            format: "TV".to_string(),
            is_tracked: false,
            sources: vec![],
            has_manga: false,
            chapters: vec![],
            relations: vec![],
        };
        db.save_calendar_cache("key-test-db", 1000, &[ev]);
        let cached = db.get_calendar_cache("key-test-db").unwrap();
        assert_eq!(cached.cached_at, 1000);
        assert_eq!(cached.events.len(), 1);
    }

    #[test]
    fn test_db_new_file_path_and_migration() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        let db = Db::new(&db_path).unwrap();
        let show = TrackedShow {
            id: "migrated-1".to_string(),
            title: "Migrated Show".to_string(),
            preferred_subgroup: None,
            preferred_resolution: None,
            last_downloaded_episode: 0,
        };
        assert!(db.add_tracked(&show));

        // Open directory as file path to trigger open error
        let invalid = Db::new(dir.path());
        assert!(invalid.is_err());
    }

    #[test]
    fn test_db_error_resilience() {
        let db = Db::in_memory();

        // Query non-existent cache key
        assert!(db.get_calendar_cache("non-existent-key").is_none());

        // Insert invalid JSON into calendar_cache table to hit deserialization error
        {
            let conn = db.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO calendar_cache (key, cached_at, data) VALUES ('bad-json', 100, 'invalid json')",
                [],
            )
            .unwrap();
        }
        assert!(db.get_calendar_cache("bad-json").is_none());

        // Drop tables to hit prepare error branches
        {
            let conn = db.conn.lock().unwrap();
            conn.execute("DROP TABLE calendar_cache", []).unwrap();
            conn.execute("DROP TABLE tracked_shows", []).unwrap();
        }
        assert!(db.get_calendar_cache("any-key").is_none());
        assert_eq!(db.list_tracked().len(), 0);

        let db_cloned = db.clone();
        let _ = db_cloned;
    }

    #[test]
    fn test_db_additional_coverage() {
        let db = Db::in_memory();
        // Call save_calendar_cache with empty key and events to hit all branches
        db.save_calendar_cache("k1", 100, &[]);
        let cached = db.get_calendar_cache("k1").unwrap();
        assert_eq!(cached.events.len(), 0);

        // Call remove_tracked on invalid table or connection error
        {
            let conn = db.conn.lock().unwrap();
            conn.execute("DROP TABLE tracked_shows", []).unwrap();
        }
        assert!(!db.remove_tracked("any"));
    }

    #[test]
    fn test_list_tracked_row_get_error_path() {
        let db = Db::in_memory();
        {
            let conn = db.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO tracked_shows (id, title, last_downloaded) VALUES (x'00', 'Title', 0)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO tracked_shows (id, title, last_downloaded) VALUES ('id1', x'00', 0)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO tracked_shows (id, title, subgroup, last_downloaded) VALUES ('id2', 'Title', x'00', 0)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO tracked_shows (id, title, resolution, last_downloaded) VALUES ('id3', 'Title', x'00', 0)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO tracked_shows (id, title, last_downloaded) VALUES ('id4', 'Title', 'nan')",
                [],
            )
            .unwrap();
        }
        assert_eq!(db.list_tracked().len(), 0);
    }

    #[test]
    fn test_get_calendar_cache_row_type_error_path() {
        let db = Db::in_memory();
        {
            let conn = db.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO calendar_cache (key, cached_at, data) VALUES ('bad-cache1', x'00', '[]')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO calendar_cache (key, cached_at, data) VALUES ('bad-cache2', 0, x'00')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO calendar_cache (key, cached_at, data) VALUES ('bad-cache3', 0, 'bad json')",
                [],
            )
            .unwrap();
        }
        assert!(db.get_calendar_cache("bad-cache1").is_none());
        assert!(db.get_calendar_cache("bad-cache2").is_none());
        assert!(db.get_calendar_cache("bad-cache3").is_none());
    }

    #[test]
    fn test_db_poison_error() {
        let db = Db::in_memory();
        let db_clone = db.clone();
        let _ = std::thread::spawn(move || {
            let _conn = db_clone.conn.lock().unwrap();
            panic!("Poison the lock!");
        })
        .join();

        let _ = db.list_tracked();
        let show = TrackedShow {
            id: "id".to_string(),
            title: "t".to_string(),
            preferred_subgroup: None,
            preferred_resolution: None,
            last_downloaded_episode: 0,
        };
        db.add_tracked(&show);
        db.remove_tracked("id");
        db.get_calendar_cache("key");
        db.save_calendar_cache("key", 1000, &[]);
        db.clear_calendar_cache();

        // Also cover test scopes that use it
        {
            let _conn = db.conn.lock().unwrap_or_else(|e| e.into_inner());
        }
    }

    #[test]
    fn test_clear_calendar_cache() {
        let db = Db::in_memory();
        db.save_calendar_cache("k1", 100, &[]);
        assert!(db.get_calendar_cache("k1").is_some());
        db.clear_calendar_cache();
        assert!(db.get_calendar_cache("k1").is_none());
    }
}
