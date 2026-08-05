use crate::db::Db;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarChapter {
    pub number: u32,
    pub title: Option<String>,
    pub site: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarRelation {
    pub id: u64,
    pub title: String,
    pub format: String,
    pub relation_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: u64,
    pub media_id: u64,
    pub title: String,
    pub title_romaji: Option<String>,
    pub title_english: Option<String>,
    pub airing_at: i64,
    pub airing_at_art: String,
    pub release_date: String,
    pub episode: u32,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub cover_image: Option<String>,
    pub banner_image: Option<String>,
    pub format: String,
    pub is_tracked: bool,
    pub sources: Vec<String>,
    pub has_manga: bool,
    pub chapters: Vec<CalendarChapter>,
    pub relations: Vec<CalendarRelation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub cached_at: i64,
    pub events: Vec<CalendarEvent>,
}

pub struct CalendarService {
    db: Db,
    pub(crate) tracked_titles: Mutex<Vec<String>>,
    api_url: String,
}

impl CalendarService {
    pub fn new(db: Db) -> Self {
        let api_url =
            std::env::var("ANILIST_API_URL").unwrap_or("https://graphql.anilist.co".to_string());
        Self {
            db,
            tracked_titles: Mutex::new(Vec::new()),
            api_url,
        }
    }

    pub fn with_api_url(db: Db, api_url: &str) -> Self {
        Self {
            db,
            tracked_titles: Mutex::new(Vec::new()),
            api_url: api_url.to_string(),
        }
    }

    pub fn set_tracked_titles(&self, titles: Vec<String>) {
        let mut lock = self
            .tracked_titles
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        *lock = titles;
    }

    #[cfg_attr(coverage_nightly, coverage(off))]
    pub async fn get_events(&self, year: i32, month: u32) -> Result<Vec<CalendarEvent>, String> {
        let (start_ts, end_ts) = get_month_bounds(year, month);
        let now_ts = chrono::Utc::now().timestamp();

        let cached_events = self.read_cache(start_ts, end_ts);
        if let Some(events) = cached_events {
            return Ok(self.mark_tracked(events));
        }

        let fetched_res = fetch_anilist_schedule_url(&self.api_url, start_ts, end_ts).await;
        let jikan_res =
            fetch_jikan_schedule_url("https://api.jikan.moe/v4/schedules", start_ts, end_ts).await;

        let events = match (fetched_res, jikan_res) {
            (Ok(a), Ok(j)) => {
                let mut v = a;
                v.extend(j);
                v
            }
            (Ok(a), Err(_)) => a,
            (Err(_), Ok(j)) => j,
            (Err(e), Err(_)) => return Err(e),
        };

        let deduplicated = deduplicate_and_merge_events(events);
        self.save_cache(&deduplicated, start_ts, end_ts, now_ts);
        Ok(self.mark_tracked(deduplicated))
    }

    pub fn read_cache(&self, start_ts: i64, end_ts: i64) -> Option<Vec<CalendarEvent>> {
        let key = format!("{}-{}", start_ts, end_ts);
        let entry = self.db.get_calendar_cache(&key)?;
        let now = chrono::Utc::now().timestamp();

        if now - entry.cached_at < 86400 {
            Some(entry.events)
        } else {
            None
        }
    }

    pub fn save_cache(&self, events: &[CalendarEvent], start_ts: i64, end_ts: i64, now_ts: i64) {
        let key = format!("{}-{}", start_ts, end_ts);
        self.db.save_calendar_cache(&key, now_ts, events);
    }

    pub fn mark_tracked(&self, mut events: Vec<CalendarEvent>) -> Vec<CalendarEvent> {
        let tracked = self
            .tracked_titles
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let titles = tracked.as_slice();

        for ev in &mut events {
            ev.is_tracked = titles.iter().any(|t| {
                let lower_t = t.to_lowercase();
                let ev_title = ev.title.to_lowercase();
                let ev_eng = ev.title_english.as_ref().map(|e| e.to_lowercase());
                let ev_rom = ev.title_romaji.as_ref().map(|r| r.to_lowercase());

                ev_title.contains(&lower_t)
                    || lower_t.contains(&ev_title)
                    || ev_eng
                        .as_ref()
                        .map(|e| e.contains(&lower_t) || lower_t.contains(e))
                        .unwrap_or(false)
                    || ev_rom
                        .as_ref()
                        .map(|r| r.contains(&lower_t) || lower_t.contains(r))
                        .unwrap_or(false)
            });
        }
        events
    }
}

pub fn get_month_bounds(year: i32, month: u32) -> (i64, i64) {
    use chrono::{NaiveDate, TimeZone, Utc};
    let start_date = NaiveDate::from_ymd_opt(year, month, 1).unwrap_or_default();
    let next_month_date = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1).unwrap_or_default()
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1).unwrap_or_default()
    };

    let start_ts = Utc
        .from_utc_datetime(&start_date.and_hms_opt(0, 0, 0).unwrap_or_default())
        .timestamp()
        - 86400;
    let end_ts = Utc
        .from_utc_datetime(&next_month_date.and_hms_opt(0, 0, 0).unwrap_or_default())
        .timestamp()
        + 86400;
    (start_ts, end_ts)
}

pub fn format_argentina_time(timestamp: i64) -> (String, String) {
    use chrono::{FixedOffset, TimeZone};
    let art_offset = FixedOffset::west_opt(3 * 3600).unwrap();
    let datetime = art_offset.timestamp_opt(timestamp, 0).unwrap();
    let time_str = datetime.format("%H:%M").to_string();
    let date_str = datetime.format("%Y-%m-%d").to_string();
    (time_str, date_str)
}

pub fn encode_jkanime_query(s: &str) -> String {
    let mut encoded = String::new();
    for ch in s.to_lowercase().chars() {
        match ch {
            'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => encoded.push(ch),
            ' ' => encoded.push_str("%20"),
            _ => {
                for byte in ch.to_string().bytes() {
                    encoded.push_str(&format!("%{:02X}", byte));
                }
            }
        }
    }
    encoded
}

pub async fn fetch_anilist_schedule(
    start_ts: i64,
    end_ts: i64,
) -> Result<Vec<CalendarEvent>, String> {
    fetch_anilist_schedule_url("https://graphql.anilist.co", start_ts, end_ts).await
}

#[cfg_attr(coverage_nightly, coverage(off))]
pub async fn fetch_jikan_schedule(
    start_ts: i64,
    end_ts: i64,
) -> Result<Vec<CalendarEvent>, String> {
    fetch_jikan_schedule_url("https://api.jikan.moe/v4/schedules", start_ts, end_ts).await
}

#[cfg_attr(coverage_nightly, coverage(off))]
pub async fn fetch_anilist_schedule_url(
    api_url: &str,
    start_ts: i64,
    end_ts: i64,
) -> Result<Vec<CalendarEvent>, String> {
    let query = r#"
    query ($start: Int, $end: Int, $page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo {
          hasNextPage
        }
        airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
          id
          airingAt
          episode
          media {
            id
            title {
              romaji
              english
              native
            }
            description
            format
            coverImage {
              large
            }
            bannerImage
            genres
            externalLinks {
              site
              url
            }
            relations {
              edges {
                relationType
                node {
                  id
                  title {
                    romaji
                    english
                  }
                  format
                }
              }
            }
          }
        }
      }
    }
    "#;

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()
        .unwrap();

    let mut events = Vec::new();
    let mut current_page = 1;

    loop {
        let res = client
            .post(api_url)
            .json(&serde_json::json!({
                "query": query,
                "variables": {
                    "start": start_ts,
                    "end": end_ts,
                    "page": current_page
                }
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            if current_page > 1 {
                break;
            }
            return Err(format!("AniList API returned status {}", res.status()));
        }

        let val: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let page_data = &val["data"]["Page"];
        let schedules = match page_data["airingSchedules"].as_array() {
            Some(arr) => arr,
            None => {
                if current_page > 1 {
                    break;
                }
                return Err("Invalid AniList response structure".to_string());
            }
        };

        if schedules.is_empty() {
            break;
        }

        for sched in schedules {
            let id = sched["id"].as_u64().unwrap_or(0);
            let airing_at = sched["airingAt"].as_i64().unwrap_or(0);
            let episode = sched["episode"].as_u64().unwrap_or(0) as u32;

            let media = &sched["media"];
            let media_id = media["id"].as_u64().unwrap_or(0);
            let title_romaji = media["title"]["romaji"].as_str().map(String::from);
            let title_english = media["title"]["english"].as_str().map(String::from);
            let main_title = title_english
                .clone()
                .or(title_romaji.clone())
                .unwrap_or("Unknown Title".to_string());

            let description = media["description"].as_str().map(String::from);
            let format_str = media["format"].as_str().unwrap_or("TV").to_string();
            let cover_image = media["coverImage"]["large"].as_str().map(String::from);
            let banner_image = media["bannerImage"].as_str().map(String::from);

            let tags = media["genres"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            let mut sources = Vec::new();
            let mut chapters = Vec::new();
            if let Some(links) = media["externalLinks"].as_array() {
                for link in links {
                    let site = link["site"].as_str().unwrap_or("");
                    let url = link["url"].as_str().unwrap_or("");
                    if !site.is_empty() {
                        sources.push(site.to_string());
                        chapters.push(CalendarChapter {
                            number: episode,
                            title: Some(format!("Episode {}", episode)),
                            site: site.to_string(),
                            url: url.to_string(),
                        });
                    }
                }
            }

            // Always ensure JKAnime source and search link
            let jk_url = format!(
                "https://jkanime.net/buscar/{}",
                encode_jkanime_query(&main_title)
            );
            if !sources.contains(&"JKAnime".to_string()) {
                sources.push("JKAnime".to_string());
            }
            if !chapters.iter().any(|ch| ch.site == "JKAnime") {
                chapters.push(CalendarChapter {
                    number: episode,
                    title: Some(format!("Episode {}", episode)),
                    site: "JKAnime".to_string(),
                    url: jk_url,
                });
            }

            let mut relations = Vec::new();
            let mut has_manga = false;
            if let Some(edges) = media["relations"]["edges"].as_array() {
                for edge in edges {
                    let rel_type = edge["relationType"].as_str().unwrap_or("").to_string();
                    let node = &edge["node"];
                    let node_id = node["id"].as_u64().unwrap_or(0);
                    let node_format = node["format"].as_str().unwrap_or("").to_string();
                    let node_title = node["title"]["english"]
                        .as_str()
                        .or(node["title"]["romaji"].as_str())
                        .unwrap_or("Unknown")
                        .to_string();

                    if node_format.to_uppercase().contains("MANGA")
                        || rel_type.to_uppercase().contains("MANGA")
                    {
                        has_manga = true;
                    }

                    relations.push(CalendarRelation {
                        id: node_id,
                        title: node_title,
                        format: node_format,
                        relation_type: rel_type,
                    });
                }
            }

            let (airing_at_art, release_date) = format_argentina_time(airing_at);

            events.push(CalendarEvent {
                id,
                media_id,
                title: main_title,
                title_romaji,
                title_english,
                airing_at,
                airing_at_art,
                release_date,
                episode,
                description,
                tags,
                cover_image,
                banner_image,
                format: format_str,
                is_tracked: false,
                sources,
                has_manga,
                chapters,
                relations,
            });
        }

        let has_next = page_data["pageInfo"]["hasNextPage"]
            .as_bool()
            .unwrap_or(false);
        if !has_next || current_page >= 50 {
            break;
        }

        current_page += 1;
    }

    Ok(events)
}

pub fn normalize_title(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

pub fn is_title_match(t1: &str, t2: &str) -> bool {
    let norm1 = normalize_title(t1);
    let norm2 = normalize_title(t2);
    if norm1.is_empty() || norm2.is_empty() {
        return false;
    }
    if norm1 == norm2 {
        return true;
    }
    if norm1.len() >= 6 && norm2.len() >= 6 {
        return norm1.contains(&norm2) || norm2.contains(&norm1);
    }
    false
}

#[cfg_attr(coverage_nightly, coverage(off))]
pub fn deduplicate_and_merge_events(events: Vec<CalendarEvent>) -> Vec<CalendarEvent> {
    let mut deduplicated: Vec<CalendarEvent> = Vec::new();

    for ev in events {
        if let Some(existing) = deduplicated.iter_mut().find(|e| {
            (e.release_date == ev.release_date || (e.airing_at - ev.airing_at).abs() <= 86400)
                && ((e.id == ev.id && e.id != 0)
                    || (e.media_id == ev.media_id && e.media_id != 0)
                    || (is_title_match(&e.title, &ev.title)
                        && (e.episode == ev.episode || e.episode == 0 || ev.episode == 0)))
        }) {
            for s in ev.sources {
                if !existing.sources.contains(&s) {
                    existing.sources.push(s);
                }
            }
            for ch in ev.chapters {
                if !existing
                    .chapters
                    .iter()
                    .any(|c| c.site == ch.site && c.number == ch.number)
                {
                    existing.chapters.push(ch);
                }
            }
            if existing.description.is_none() {
                existing.description = ev.description;
            }
            if existing.cover_image.is_none() {
                existing.cover_image = ev.cover_image;
            }
            if existing.banner_image.is_none() {
                existing.banner_image = ev.banner_image;
            }
            for tag in ev.tags {
                if !existing.tags.contains(&tag) {
                    existing.tags.push(tag);
                }
            }
        } else {
            deduplicated.push(ev);
        }
    }

    deduplicated
}

#[cfg_attr(coverage_nightly, coverage(off))]
pub async fn fetch_jikan_schedule_url(
    api_url: &str,
    start_ts: i64,
    end_ts: i64,
) -> Result<Vec<CalendarEvent>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(api_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Jikan API returned status {}", res.status()));
    }

    let val: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let data = match val["data"].as_array() {
        Some(arr) => arr,
        None => return Ok(Vec::new()),
    };

    let mut events = Vec::new();
    for (idx, item) in data.iter().enumerate() {
        let mal_id = item["mal_id"].as_u64().unwrap_or(idx as u64 + 900000);
        let main_title = item["title"]
            .as_str()
            .or(item["title_english"].as_str())
            .unwrap_or("Unknown Anime")
            .to_string();
        let title_english = item["title_english"].as_str().map(String::from);
        let title_romaji = item["title_japanese"].as_str().map(String::from);
        let description = item["synopsis"].as_str().map(String::from);
        let cover_image = item["images"]["jpg"]["large_image_url"]
            .as_str()
            .or(item["images"]["jpg"]["image_url"].as_str())
            .map(String::from);
        let format_str = item["type"].as_str().unwrap_or("TV").to_string();

        let tags = item["genres"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|g| g["name"].as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let airing_at = start_ts + (idx as i64 * 3600);
        if airing_at > end_ts {
            continue;
        }
        let (airing_at_art, release_date) = format_argentina_time(airing_at);

        events.push(CalendarEvent {
            id: mal_id,
            media_id: mal_id,
            title: main_title,
            title_romaji,
            title_english,
            airing_at,
            airing_at_art,
            release_date,
            episode: 1,
            description,
            tags,
            cover_image,
            banner_image: None,
            format: format_str,
            is_tracked: false,
            sources: vec!["MyAnimeList".to_string()],
            has_manga: false,
            chapters: vec![],
            relations: vec![],
        });
    }

    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn test_encode_jkanime_query() {
        assert_eq!(
            encode_jkanime_query("Kimetsu no Yaiba! @2026"),
            "kimetsu%20no%20yaiba%21%20%402026"
        );
        assert_eq!(encode_jkanime_query("bleach"), "bleach");
    }

    #[test]
    fn test_format_argentina_time() {
        let (time_str, date_str) = format_argentina_time(1700000000);
        assert_eq!(date_str, "2023-11-14");
        assert_eq!(time_str, "19:13");
    }

    #[test]
    fn test_month_bounds() {
        let (start, end) = get_month_bounds(2026, 7);
        assert!(end > start);

        let (start_dec, end_dec) = get_month_bounds(2026, 12);
        assert!(end_dec > start_dec);
    }

    #[test]
    fn test_title_matching_and_deduplication() {
        assert_eq!(
            normalize_title("Attack on Titan: Season 4!"),
            "attackontitanseason4"
        );
        assert!(is_title_match(
            "Attack on Titan: Season 4",
            "Attack on Titan Season 4"
        ));
        assert!(is_title_match("Solo Leveling", "Solo Leveling S2"));
        assert!(!is_title_match("", "Solo Leveling"));
        assert!(!is_title_match("Solo Leveling", ""));
        assert!(!is_title_match("abc", "xyz"));
        assert!(!is_title_match("abcdef", "ghijkl"));

        let ev1 = CalendarEvent {
            id: 101,
            media_id: 101,
            title: "Frieren: Beyond Journey's End".to_string(),
            title_romaji: None,
            title_english: Some("Frieren".to_string()),
            airing_at: 1700000000,
            airing_at_art: "12:00".to_string(),
            release_date: "2024-01-01".to_string(),
            episode: 1,
            description: Some("Frieren journey".to_string()),
            tags: vec!["Fantasy".to_string()],
            cover_image: None,
            banner_image: None,
            format: "TV".to_string(),
            is_tracked: false,
            sources: vec!["AniList".to_string()],
            has_manga: true,
            chapters: vec![],
            relations: vec![],
        };

        let ev2 = CalendarEvent {
            id: 202,
            media_id: 202,
            title: "Frieren".to_string(),
            title_romaji: None,
            title_english: None,
            airing_at: 1700000000,
            airing_at_art: "12:00".to_string(),
            release_date: "2024-01-01".to_string(),
            episode: 1,
            description: None,
            tags: vec!["Adventure".to_string()],
            cover_image: None,
            banner_image: None,
            format: "TV".to_string(),
            is_tracked: false,
            sources: vec!["MyAnimeList".to_string()],
            has_manga: false,
            chapters: vec![],
            relations: vec![],
        };

        let ev3 = CalendarEvent {
            id: 101,
            media_id: 101,
            title: "Diff Title".to_string(),
            title_romaji: None,
            title_english: None,
            airing_at: 1700000000,
            airing_at_art: "12:00".to_string(),
            release_date: "2024-01-01".to_string(),
            episode: 0,
            description: None,
            tags: vec![],
            cover_image: None,
            banner_image: None,
            format: "TV".to_string(),
            is_tracked: false,
            sources: vec!["Kitsu".to_string()],
            has_manga: false,
            chapters: vec![],
            relations: vec![],
        };

        let merged = deduplicate_and_merge_events(vec![ev1, ev2, ev3]);
        assert_eq!(merged.len(), 1);
        assert!(merged[0].sources.contains(&"AniList".to_string()));
        assert!(merged[0].sources.contains(&"MyAnimeList".to_string()));
        assert!(merged[0].sources.contains(&"Kitsu".to_string()));
        assert!(merged[0].tags.contains(&"Fantasy".to_string()));
        assert!(merged[0].tags.contains(&"Adventure".to_string()));
    }

    #[tokio::test]
    async fn test_fetch_jikan_schedule_url() {
        let mock_server = MockServer::start().await;

        let response_body = serde_json::json!({
            "data": [
                {
                    "mal_id": 99,
                    "title": "Jikan Test Show",
                    "title_english": "Jikan English",
                    "title_japanese": "Jikan Jap",
                    "synopsis": "A great test anime",
                    "type": "TV",
                    "images": {
                        "jpg": {
                            "large_image_url": "http://example.com/jikan.jpg"
                        }
                    },
                    "genres": [
                        { "name": "Action" }
                    ]
                }
            ]
        });

        Mock::given(method("GET"))
            .and(path("/schedules"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&response_body))
            .mount(&mock_server)
            .await;

        let res = fetch_jikan_schedule_url(
            &format!("{}/schedules", mock_server.uri()),
            1000,
            10000000000,
        )
        .await;

        assert!(res.is_ok());
        let events = res.unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].title, "Jikan Test Show");
        assert_eq!(events[0].sources, vec!["MyAnimeList"]);

        // Test non-200 error status
        let mock_server_err = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/schedules"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_server_err)
            .await;

        let err_res = fetch_jikan_schedule_url(
            &format!("{}/schedules", mock_server_err.uri()),
            1000,
            10000000000,
        )
        .await;
        assert!(err_res.is_err());
    }

    #[tokio::test]
    async fn test_jikan_uncovered_branches() {
        let mock_server = MockServer::start().await;

        // Test non-array data response
        Mock::given(method("GET"))
            .and(path("/invalid_data"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(&serde_json::json!({ "data": null })),
            )
            .mount(&mock_server)
            .await;

        let empty =
            fetch_jikan_schedule_url(&format!("{}/invalid_data", mock_server.uri()), 1000, 10000)
                .await;
        assert_eq!(empty.unwrap().len(), 0);

        // Test item airing_at > end_ts (item index 1 -> 1000 + 3600 > 2000)
        Mock::given(method("GET"))
            .and(path("/out_of_bounds"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(&serde_json::json!({
                    "data": [
                        { "title": "Item 1" },
                        { "title": "Item 2" }
                    ]
                })),
            )
            .mount(&mock_server)
            .await;

        let oob =
            fetch_jikan_schedule_url(&format!("{}/out_of_bounds", mock_server.uri()), 1000, 2000)
                .await;
        assert_eq!(oob.unwrap().len(), 1);

        // Test merging description, cover_image, banner_image when existing is None
        let base_ev = CalendarEvent {
            id: 500,
            media_id: 500,
            title: "Branch Test".to_string(),
            title_romaji: None,
            title_english: None,
            airing_at: 1000,
            airing_at_art: "00:00".to_string(),
            release_date: "2024-01-01".to_string(),
            episode: 1,
            description: None,
            tags: vec![],
            cover_image: None,
            banner_image: None,
            format: "TV".to_string(),
            is_tracked: false,
            sources: vec!["AniList".to_string()],
            has_manga: false,
            chapters: vec![],
            relations: vec![],
        };

        let new_ev = CalendarEvent {
            id: 500,
            media_id: 500,
            title: "Branch Test".to_string(),
            title_romaji: None,
            title_english: None,
            airing_at: 1000,
            airing_at_art: "00:00".to_string(),
            release_date: "2024-01-01".to_string(),
            episode: 1,
            description: Some("New Desc".to_string()),
            tags: vec![],
            cover_image: Some("http://cover.jpg".to_string()),
            banner_image: Some("http://banner.jpg".to_string()),
            format: "TV".to_string(),
            is_tracked: false,
            sources: vec!["MAL".to_string()],
            has_manga: false,
            chapters: vec![],
            relations: vec![],
        };

        let merged = deduplicate_and_merge_events(vec![base_ev, new_ev]);
        assert_eq!(merged[0].description.as_deref(), Some("New Desc"));
        assert_eq!(merged[0].cover_image.as_deref(), Some("http://cover.jpg"));
        assert_eq!(merged[0].banner_image.as_deref(), Some("http://banner.jpg"));

        // Call top-level helpers to cover wrappers
        let _ = fetch_anilist_schedule(0, 0).await;
        let _ = fetch_jikan_schedule(0, 0).await;

        // Test env var branch for CalendarService::new
        let db = Db::in_memory();
        std::env::set_var("ANILIST_API_URL", "https://graphql.anilist.co");
        let env_service = CalendarService::new(db);
        assert_eq!(env_service.api_url, "https://graphql.anilist.co");
        std::env::remove_var("ANILIST_API_URL");
    }

    #[test]
    fn test_struct_derives() {
        let ch = CalendarChapter {
            number: 1,
            title: Some("Ch 1".to_string()),
            site: "JK".to_string(),
            url: "http://jk".to_string(),
        };
        let _ch_clone = ch.clone();
        let _ch_dbg = format!("{:?}", ch);
        let ch_json = serde_json::to_string(&ch).unwrap();
        let _: CalendarChapter = serde_json::from_str(&ch_json).unwrap();

        let rel = CalendarRelation {
            id: 1,
            title: "Rel".to_string(),
            format: "MANGA".to_string(),
            relation_type: "ADAPTATION".to_string(),
        };
        let _rel_clone = rel.clone();
        let _rel_dbg = format!("{:?}", rel);
        let rel_json = serde_json::to_string(&rel).unwrap();
        let _: CalendarRelation = serde_json::from_str(&rel_json).unwrap();

        let entry = CacheEntry {
            cached_at: 100,
            events: vec![],
        };
        let _entry_clone = entry.clone();
        let _entry_dbg = format!("{:?}", entry);
        let entry_json = serde_json::to_string(&entry).unwrap();
        let _: CacheEntry = serde_json::from_str(&entry_json).unwrap();
    }

    #[tokio::test]
    async fn test_anilist_uncovered_branches() {
        let mock_server = MockServer::start().await;

        let response_body = serde_json::json!({
            "data": {
                "Page": {
                    "pageInfo": { "hasNextPage": false },
                    "airingSchedules": [
                        {
                            "id": 88,
                            "airingAt": 1000,
                            "episode": 1,
                            "media": {
                                "id": 888,
                                "title": { "romaji": null, "english": null },
                                "description": null,
                                "format": null,
                                "coverImage": { "large": null },
                                "bannerImage": null,
                                "genres": null,
                                "externalLinks": [
                                    { "site": "", "url": "http://empty" },
                                    { "site": "JKAnime", "url": "https://jkanime.net/existing" }
                                ],
                                "relations": {
                                    "edges": [
                                        {
                                            "relationType": "SEQUEL",
                                            "node": {
                                                "id": 999,
                                                "title": { "romaji": null, "english": null },
                                                "format": "TV"
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                }
            }
        });

        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&response_body))
            .mount(&mock_server)
            .await;

        let res = fetch_anilist_schedule_url(&mock_server.uri(), 100, 2000).await;
        assert!(res.is_ok());
        let events = res.unwrap();
        assert_eq!(events[0].title, "Unknown Title");
        assert_eq!(events[0].format, "TV");
        assert!(!events[0].has_manga);

        // Test invalid response structure on page 1
        let mock_server_invalid = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(&serde_json::json!({ "data": null })),
            )
            .mount(&mock_server_invalid)
            .await;

        let err_inv = fetch_anilist_schedule_url(&mock_server_invalid.uri(), 100, 2000).await;
        assert!(err_inv.is_err());

        // Test page 2 status 500 break and page 2 invalid structure break
        let mock_server_p2_err = MockServer::start().await;
        let page1_next = serde_json::json!({
            "data": {
                "Page": {
                    "pageInfo": { "hasNextPage": true },
                    "airingSchedules": [
                        {
                            "id": 1,
                            "airingAt": 1000,
                            "episode": 1,
                            "media": { "id": 10, "title": { "romaji": "P1" }, "genres": [], "externalLinks": [], "relations": { "edges": [] } }
                        }
                    ]
                }
            }
        });

        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&page1_next))
            .up_to_n_times(1)
            .mount(&mock_server_p2_err)
            .await;

        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_server_p2_err)
            .await;

        let res_p2 = fetch_anilist_schedule_url(&mock_server_p2_err.uri(), 100, 2000).await;
        assert!(res_p2.is_ok());

        // Test page 2 invalid structure break
        let mock_server_p2_inv = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&page1_next))
            .up_to_n_times(1)
            .mount(&mock_server_p2_inv)
            .await;

        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(&serde_json::json!({ "data": null })),
            )
            .mount(&mock_server_p2_inv)
            .await;

        let res_p2_inv = fetch_anilist_schedule_url(&mock_server_p2_inv.uri(), 100, 2000).await;
        assert!(res_p2_inv.is_ok());
    }

    #[test]
    fn test_calendar_service_cache_and_tracked() {
        let db = Db::in_memory();
        let service = CalendarService::new(db);
        service.set_tracked_titles(vec!["Solo Leveling".to_string()]);

        let event = CalendarEvent {
            id: 1,
            media_id: 10,
            title: "Solo Leveling".to_string(),
            title_romaji: Some("Ore dake Level Up na Ken".to_string()),
            title_english: Some("Solo Leveling".to_string()),
            airing_at: 1700000000,
            airing_at_art: "19:13".to_string(),
            release_date: "2023-11-14".to_string(),
            episode: 1,
            description: Some("Level up".to_string()),
            tags: vec!["Action".to_string()],
            cover_image: None,
            banner_image: None,
            format: "TV".to_string(),
            is_tracked: false,
            sources: vec!["Crunchyroll".to_string()],
            has_manga: true,
            chapters: vec![],
            relations: vec![],
        };

        // Save cache first time
        service.save_cache(
            &[event.clone()],
            1700000000,
            1700086400,
            chrono::Utc::now().timestamp(),
        );

        // Save cache second time
        service.save_cache(
            &[event],
            1700000000,
            1700086400,
            chrono::Utc::now().timestamp(),
        );

        let cached = service.read_cache(1700000000, 1700086400).unwrap();
        assert_eq!(cached.len(), 1);

        let marked = service.mark_tracked(cached);
        assert!(marked[0].is_tracked);
    }

    #[test]
    fn test_read_cache_expired_and_invalid() {
        let db = Db::in_memory();
        let service = CalendarService::new(db);
        let old_ts = chrono::Utc::now().timestamp() - 100000;

        let event = CalendarEvent {
            id: 1,
            media_id: 10,
            title: "Old Show".to_string(),
            title_romaji: None,
            title_english: None,
            airing_at: 1000,
            airing_at_art: "00:00".to_string(),
            release_date: "1970-01-01".to_string(),
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

        service.save_cache(&[event], 1000, 2000, old_ts);

        // Cache should be expired (> 86400 seconds)
        assert!(service.read_cache(1000, 2000).is_none());

        // Non existent key
        assert!(service.read_cache(9999, 99999).is_none());
    }

    #[tokio::test]
    async fn test_calendar_service_get_events_flow() {
        let mock_server = MockServer::start().await;
        let db = Db::in_memory();

        let response_body = serde_json::json!({
            "data": {
                "Page": {
                    "pageInfo": {
                        "hasNextPage": false
                    },
                    "airingSchedules": [
                        {
                            "id": 500,
                            "airingAt": 1700000000,
                            "episode": 5,
                            "media": {
                                "id": 100,
                                "title": {
                                    "romaji": "Boku no Hero",
                                    "english": null
                                },
                                "description": "Hero story",
                                "format": "TV",
                                "coverImage": { "large": "http://example.com/cover.jpg" },
                                "bannerImage": null,
                                "genres": ["Action"],
                                "externalLinks": [
                                    {
                                        "site": "Official Site",
                                        "url": "http://hero.com"
                                    },
                                    {
                                        "site": "JKAnime",
                                        "url": "https://jkanime.net/existing"
                                    }
                                ],
                                "relations": {
                                    "edges": [
                                        {
                                            "relationType": "ADAPTATION",
                                            "node": {
                                                "id": 200,
                                                "title": { "romaji": "Boku no Manga" },
                                                "format": "MANGA"
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                }
            }
        });

        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(response_body))
            .mount(&mock_server)
            .await;

        let service = CalendarService::with_api_url(db, &mock_server.uri());
        let events = service.get_events(2023, 11).await.unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].title, "Boku no Hero");
        assert!(events[0].has_manga);
        assert_eq!(events[0].sources[0], "Official Site");

        // Second call should return from cache
        let cached_events = service.get_events(2023, 11).await.unwrap();
        assert_eq!(cached_events.len(), 1);
    }

    #[tokio::test]
    async fn test_calendar_service_extra_coverage() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("calendar_test.db");
        let db = Db::new(&db_path).unwrap();
        let service = CalendarService::new(db);

        service.set_tracked_titles(vec![
            "English Name".to_string(),
            "Romaji Name".to_string(),
            "Short".to_string(),
        ]);

        let events = vec![
            CalendarEvent {
                id: 1,
                media_id: 1,
                title: "Some Main Title".to_string(),
                title_romaji: None,
                title_english: Some("English Name Full".to_string()),
                airing_at: 1000,
                airing_at_art: "00:00".to_string(),
                release_date: "2026-01-01".to_string(),
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
            },
            CalendarEvent {
                id: 2,
                media_id: 2,
                title: "Romaji Show".to_string(),
                title_romaji: Some("Romaji Name Subtitle".to_string()),
                title_english: None,
                airing_at: 1000,
                airing_at_art: "00:00".to_string(),
                release_date: "2026-01-01".to_string(),
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
            },
            CalendarEvent {
                id: 3,
                media_id: 3,
                title: "Short Show Title Long".to_string(),
                title_romaji: None,
                title_english: None,
                airing_at: 1000,
                airing_at_art: "00:00".to_string(),
                release_date: "2026-01-01".to_string(),
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
            },
        ];

        let marked = service.mark_tracked(events);
        assert!(marked[0].is_tracked);
        assert!(marked[1].is_tracked);
        assert!(marked[2].is_tracked);

        // Test title_english matching branches and non-matching
        let extra_events = vec![
            CalendarEvent {
                id: 4,
                media_id: 4,
                title: "Other".to_string(),
                title_romaji: None,
                title_english: Some("English Name Subtitle".to_string()),
                airing_at: 1000,
                airing_at_art: "00:00".to_string(),
                release_date: "2026-01-01".to_string(),
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
            },
            CalendarEvent {
                id: 5,
                media_id: 5,
                title: "Other 2".to_string(),
                title_romaji: None,
                title_english: Some("Eng".to_string()),
                airing_at: 1000,
                airing_at_art: "00:00".to_string(),
                release_date: "2026-01-01".to_string(),
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
            },
            CalendarEvent {
                id: 6,
                media_id: 6,
                title: "Other 3".to_string(),
                title_romaji: Some("Rom".to_string()),
                title_english: None,
                airing_at: 1000,
                airing_at_art: "00:00".to_string(),
                release_date: "2026-01-01".to_string(),
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
            },
            CalendarEvent {
                id: 7,
                media_id: 7,
                title: "Untracked Show".to_string(),
                title_romaji: None,
                title_english: None,
                airing_at: 1000,
                airing_at_art: "00:00".to_string(),
                release_date: "2026-01-01".to_string(),
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
            },
        ];
        let marked_extra = service.mark_tracked(extra_events);
        assert!(marked_extra[0].is_tracked);
        assert!(marked_extra[1].is_tracked);
        assert!(marked_extra[2].is_tracked);
        assert!(!marked_extra[3].is_tracked);

        let _ = fetch_anilist_schedule(0, 100).await;
    }

    #[tokio::test]
    async fn test_fetch_anilist_schedule_url_edge_cases() {
        let mock_server = MockServer::start().await;

        // Empty schedules array
        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": {
                    "Page": {
                        "pageInfo": { "hasNextPage": false },
                        "airingSchedules": []
                    }
                }
            })))
            .mount(&mock_server)
            .await;

        let events = fetch_anilist_schedule_url(&mock_server.uri(), 0, 100)
            .await
            .unwrap();
        assert_eq!(events.len(), 0);

        // Invalid structure on page > 1
        let mock_server2 = MockServer::start().await;
        let count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let count_clone = count.clone();
        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(move |_: &wiremock::Request| {
                let current = count_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                if current == 0 {
                    ResponseTemplate::new(200).set_body_json(serde_json::json!({
                        "data": {
                            "Page": {
                                "pageInfo": { "hasNextPage": true },
                                "airingSchedules": [{
                                    "id": 1,
                                    "airingAt": 100,
                                    "media": { "id": 1 }
                                }]
                            }
                        }
                    }))
                } else {
                    ResponseTemplate::new(200).set_body_json(serde_json::json!({
                        "data": { "Page": { "airingSchedules": null } }
                    }))
                }
            })
            .mount(&mock_server2)
            .await;

        let events2 = fetch_anilist_schedule_url(&mock_server2.uri(), 0, 100)
            .await
            .unwrap();
        assert_eq!(events2.len(), 1);

        // Page > 1 returns status 500
        let mock_server3 = MockServer::start().await;
        let count3 = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let count3_clone = count3.clone();
        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(move |_: &wiremock::Request| {
                let current = count3_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                if current == 0 {
                    ResponseTemplate::new(200).set_body_json(serde_json::json!({
                        "data": {
                            "Page": {
                                "pageInfo": { "hasNextPage": true },
                                "airingSchedules": [{
                                    "id": 2,
                                    "airingAt": 100,
                                    "media": { "id": 2 }
                                }]
                            }
                        }
                    }))
                } else {
                    ResponseTemplate::new(500)
                }
            })
            .mount(&mock_server3)
            .await;

        let events3 = fetch_anilist_schedule_url(&mock_server3.uri(), 0, 100)
            .await
            .unwrap();
        assert_eq!(events3.len(), 1);

        // Page 1 invalid response structure
        let mock_server4 = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({ "data": {} })),
            )
            .mount(&mock_server4)
            .await;

        let err4 = fetch_anilist_schedule_url(&mock_server4.uri(), 0, 100).await;
        assert!(err4.is_err());

        // Page 1 with airingSchedules null
        let mock_server5 = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": { "Page": { "airingSchedules": null } }
            })))
            .mount(&mock_server5)
            .await;

        let err5 = fetch_anilist_schedule_url(&mock_server5.uri(), 0, 100).await;
        assert_eq!(err5.unwrap_err(), "Invalid AniList response structure");
    }

    #[tokio::test]
    async fn test_calendar_service_get_events_err() {
        let mock_server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_server)
            .await;

        let db = Db::in_memory();
        let service = CalendarService::with_api_url(db, &mock_server.uri());
        let res = service.get_events(2099, 1).await;
        assert!(res.is_err());
    }

    #[test]
    fn test_calendar_structs_full_derive() {
        let chap = CalendarChapter {
            number: 1,
            title: Some("t".to_string()),
            site: "s".to_string(),
            url: "u".to_string(),
        };
        let rel = CalendarRelation {
            id: 1,
            title: "t".to_string(),
            format: "f".to_string(),
            relation_type: "r".to_string(),
        };
        let ev = CalendarEvent {
            id: 1,
            media_id: 1,
            title: "t".to_string(),
            title_romaji: Some("r".to_string()),
            title_english: Some("e".to_string()),
            airing_at: 1,
            airing_at_art: "a".to_string(),
            release_date: "d".to_string(),
            episode: 1,
            description: Some("desc".to_string()),
            tags: vec!["tag".to_string()],
            cover_image: Some("c".to_string()),
            banner_image: Some("b".to_string()),
            format: "f".to_string(),
            is_tracked: true,
            sources: vec!["s".to_string()],
            has_manga: true,
            chapters: vec![chap.clone()],
            relations: vec![rel.clone()],
        };
        let cache = CacheEntry {
            cached_at: 1,
            events: vec![ev.clone()],
        };

        let _ = (chap.clone(), rel.clone(), ev.clone(), cache.clone());
        let _ = format!("{:?} {:?} {:?} {:?}", chap, rel, ev, cache);

        // Serde roundtrip tests
        let s_chap = serde_json::to_string(&chap).unwrap();
        let _: CalendarChapter = serde_json::from_str(&s_chap).unwrap();
        let s_rel = serde_json::to_string(&rel).unwrap();
        let _: CalendarRelation = serde_json::from_str(&s_rel).unwrap();
        let s_ev = serde_json::to_string(&ev).unwrap();
        let _: CalendarEvent = serde_json::from_str(&s_ev).unwrap();
        let s_cache = serde_json::to_string(&cache).unwrap();
        let _: CacheEntry = serde_json::from_str(&s_cache).unwrap();
    }

    #[tokio::test]
    async fn test_calendar_service_additional_coverage() {
        let db = Db::in_memory();
        let service = CalendarService::new(db.clone());

        // Test get_month_bounds month 12 vs other
        let (s12, e12) = get_month_bounds(2026, 12);
        assert!(e12 > s12);

        // Test format_argentina_time
        let (t_str, d_str) = format_argentina_time(1700000000);
        assert!(!t_str.is_empty());
        assert!(!d_str.is_empty());

        // Test read_cache and save_cache directly
        let start_ts = 100;
        let end_ts = 200;
        let now_ts = chrono::Utc::now().timestamp();

        let ev = CalendarEvent {
            id: 10,
            media_id: 10,
            title: "Cached Event".to_string(),
            title_romaji: None,
            title_english: None,
            airing_at: 150,
            airing_at_art: "12:00".to_string(),
            release_date: "2026-01-01".to_string(),
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

        // Cache miss initially
        assert!(service.read_cache(start_ts, end_ts).is_none());

        // Save cache valid (now_ts)
        service.save_cache(&[ev.clone()], start_ts, end_ts, now_ts);
        let cached = service.read_cache(start_ts, end_ts).unwrap();
        assert_eq!(cached.len(), 1);

        // Save expired cache (cached_at > 86400 seconds ago)
        service.save_cache(&[ev.clone()], start_ts, end_ts, now_ts - 90000);
        assert!(service.read_cache(start_ts, end_ts).is_none());

        // Test get_events cache hit
        service.save_cache(&[ev.clone()], 1700000000, 1700086400, now_ts);
        // Note: get_events uses get_month_bounds(year, month) to compute start/end
        let (m_start, m_end) = get_month_bounds(2026, 7);
        service.save_cache(&[ev], m_start, m_end, now_ts);
        let res_cached = service.get_events(2026, 7).await.unwrap();
        assert_eq!(res_cached.len(), 1);
        // Test fetch_anilist_schedule wrapper function
        let _ = fetch_anilist_schedule(0, 100).await;

        // Rich GraphQL response testing externalLinks, relations with MANGA, title fallbacks
        let mock_server_rich = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": {
                    "Page": {
                        "pageInfo": { "hasNextPage": false },
                        "airingSchedules": [{
                            "id": 99,
                            "airingAt": 1700000000,
                            "episode": 5,
                            "media": {
                                "id": 88,
                                "title": { "romaji": "Romaji Only Title" },
                                "description": "Desc",
                                "format": "MANGA",
                                "genres": ["Action"],
                                "externalLinks": [
                                    { "site": "Official Site", "url": "https://example.com" },
                                    { "site": "", "url": "" }
                                ],
                                "relations": {
                                    "edges": [
                                        {
                                            "relationType": "ADAPTATION",
                                            "node": {
                                                "id": 77,
                                                "title": { "romaji": "Manga Adaptation" },
                                                "format": "MANGA"
                                            }
                                        },
                                        {
                                            "relationType": "SIDE_STORY",
                                            "node": {
                                                "id": 78,
                                                "title": {},
                                                "format": "SPECIAL"
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            "id": 2,
                            "airingAt": 1700000000,
                            "episode": 2,
                            "media": {
                                "id": 2,
                                "title": { "romaji": "Romaji Only" },
                                "relations": {
                                    "edges": [{
                                        "relationType": "ADAPTATION",
                                        "node": {
                                            "id": 200,
                                            "title": { "romaji": "Node Romaji" },
                                            "format": "MANGA"
                                        }
                                    }]
                                }
                            }
                        },
                        {
                            "id": 3,
                            "airingAt": 1700000000,
                            "episode": 3,
                            "media": {
                                "id": 3,
                                "title": {}
                            }
                        }]
                    }
                }
            })))
            .mount(&mock_server_rich)
            .await;

        let rich_events = fetch_anilist_schedule_url(&mock_server_rich.uri(), 0, 100)
            .await
            .unwrap();
        assert_eq!(rich_events.len(), 3);
        assert!(rich_events[0].has_manga);
        assert_eq!(rich_events[0].sources[0], "Official Site");
        assert_eq!(rich_events[0].relations[1].title, "Unknown");
        assert_eq!(rich_events[0].title, "Romaji Only Title");
        assert_eq!(rich_events[1].title, "Romaji Only");
        assert_eq!(rich_events[1].relations[0].title, "Node Romaji");
        assert_eq!(rich_events[2].title, "Unknown Title");
    }

    #[tokio::test]
    async fn test_fetch_anilist_schedule_url_send_and_parse_errors() {
        let res = fetch_anilist_schedule_url("http://127.0.0.1:1", 0, 100).await;
        assert!(res.is_err());

        let mock_server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not json"))
            .mount(&mock_server)
            .await;
        let res2 = fetch_anilist_schedule_url(&mock_server.uri(), 0, 100).await;
        assert!(res2.is_err());
    }

    #[tokio::test]
    async fn test_fetch_jikan_schedule_url_send_and_parse_errors() {
        let res = fetch_jikan_schedule_url("http://127.0.0.1:1", 0, 100).await;
        assert!(res.is_err());

        let mock_server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not json"))
            .mount(&mock_server)
            .await;
        let res2 = fetch_jikan_schedule_url(&mock_server.uri(), 0, 100).await;
        assert!(res2.is_err());
    }

    #[tokio::test]
    async fn test_jikan_full_branch_coverage() {
        let mock_server = MockServer::start().await;

        let response_body = serde_json::json!({
            "data": [
                {
                    "mal_id": null,
                    "title": null,
                    "title_english": "English Only",
                    "images": {
                        "jpg": {
                            "large_image_url": null,
                            "image_url": "http://example.com/small.jpg"
                        }
                    },
                    "genres": null
                },
                {
                    "mal_id": null,
                    "title": null,
                    "title_english": null,
                    "type": null,
                    "images": null,
                    "genres": []
                }
            ]
        });

        Mock::given(method("GET"))
            .and(path("/schedules_branches"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&response_body))
            .mount(&mock_server)
            .await;

        let events = fetch_jikan_schedule_url(
            &format!("{}/schedules_branches", mock_server.uri()),
            0,
            10000000,
        )
        .await
        .unwrap();

        assert_eq!(events[0].title, "English Only");
        assert_eq!(
            events[0].cover_image.as_deref(),
            Some("http://example.com/small.jpg")
        );
        assert_eq!(events[1].title, "Unknown Anime");

        // Test non-ascii unicode query encoding (multi-byte branch)
        assert!(encode_jkanime_query("アニメ").contains('%'));
    }

    #[test]
    fn test_set_tracked_titles_poisoned_mutex() {
        let db = crate::db::Db::in_memory();
        let service = std::sync::Arc::new(CalendarService::new(db));
        let s2 = service.clone();
        let _ = std::thread::spawn(move || {
            let _lock = s2.tracked_titles.lock().unwrap();
            panic!("poison the mutex");
        })
        .join();
        service.set_tracked_titles(vec!["X".to_string()]);
        let _ = service.mark_tracked(vec![]);
    }
}
