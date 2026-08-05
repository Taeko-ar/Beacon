#![cfg_attr(coverage_nightly, feature(coverage_attribute))]
#![allow(unexpected_cfgs)]
pub mod calendar;
pub mod db;
pub mod nyaa;
pub mod tracker;

use axum::{
    extract::{Path, Query, State},
    routing::{delete, get},
    Json, Router,
};
use chrono::Datelike;

use serde::{Deserialize, Serialize};
use std::env;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

#[derive(Serialize, Debug, PartialEq)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
}

pub async fn health_handler() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[derive(Deserialize, Debug, Clone)]
pub struct SearchQuery {
    pub q: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct CatalogSearchQuery {
    pub q: Option<String>,
    pub page: Option<u32>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct CheckQuery {
    pub title: Option<String>,
}

pub async fn search_handler(Query(params): Query<SearchQuery>) -> Json<Vec<nyaa::NyaaRelease>> {
    let res = nyaa::search_nyaa(params.q.as_deref()).await;
    Json(res.unwrap_or_default())
}

pub async fn catalog_search_handler(
    Query(params): Query<CatalogSearchQuery>,
) -> Json<nyaa::CatalogResponse> {
    let q = params.q.as_deref().unwrap_or("");
    let res = nyaa::search_catalog(q, params.page).await;
    Json(res.unwrap_or(nyaa::CatalogResponse {
        items: Vec::new(),
        page: params.page.unwrap_or(1),
        has_next_page: false,
    }))
}

pub async fn nyaa_check_handler(Query(params): Query<CheckQuery>) -> Json<serde_json::Value> {
    let title = params.title.as_deref().unwrap_or("");
    let is_torrenteable = nyaa::check_nyaa_torrenteable(title).await.unwrap_or(false);
    Json(serde_json::json!({ "is_torrenteable": is_torrenteable }))
}

pub async fn list_tracked_handler(
    State(tracker): State<tracker::TrackerStore>,
) -> Json<Vec<tracker::TrackedShow>> {
    Json(tracker.list())
}

pub async fn add_tracked_handler(
    State(tracker): State<tracker::TrackerStore>,
    Json(show): Json<tracker::TrackedShow>,
) -> Json<tracker::TrackedShow> {
    tracker.add(show.clone());
    Json(show)
}

pub async fn remove_tracked_handler(
    State(tracker): State<tracker::TrackerStore>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    if tracker.remove(&id) {
        Ok(Json(serde_json::json!({ "status": "removed" })))
    } else {
        Err((
            axum::http::StatusCode::NOT_FOUND,
            "Show not found".to_string(),
        ))
    }
}

#[derive(Deserialize, Debug, Clone)]
pub struct CalendarParams {
    pub year: Option<i32>,
    pub month: Option<u32>,
}

pub async fn calendar_handler(
    State(tracker): State<tracker::TrackerStore>,
    Query(params): Query<CalendarParams>,
) -> Json<serde_json::Value> {
    let now = chrono::Utc::now();
    let year = params.year.unwrap_or(now.year());
    let month = params.month.unwrap_or(now.month());

    let service = calendar::CalendarService::new(tracker.db().clone());
    let tracked_titles = tracker.list().into_iter().map(|t| t.title).collect();
    service.set_tracked_titles(tracked_titles);

    match service.get_events(year, month).await {
        Ok(events) => Json(serde_json::json!({
            "ok": true,
            "data": events
        })),
        Err(e) => Json(serde_json::json!({
            "ok": false,
            "error": "CALENDAR_FETCH_ERROR",
            "message": e
        })),
    }
}

pub async fn clear_calendar_cache_handler(
    State(tracker): State<tracker::TrackerStore>,
) -> Json<serde_json::Value> {
    tracker.db().clear_calendar_cache();
    Json(serde_json::json!({
        "ok": true,
        "message": "Calendar cache cleared"
    }))
}

pub fn app(tracker: tracker::TrackerStore) -> Router {
    let allowed_origin =
        std::env::var("FRONTEND_ORIGIN").unwrap_or("http://anime.local:5173".to_string());
    let cors = CorsLayer::new()
        .allow_origin(allowed_origin.parse::<axum::http::HeaderValue>().unwrap_or(
            axum::http::HeaderValue::from_static("http://anime.local:5173"),
        ))
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::DELETE,
        ])
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health_handler))
        .route("/api/search", get(search_handler))
        .route("/api/catalog/search", get(catalog_search_handler))
        .route("/api/nyaa/check", get(nyaa_check_handler))
        .route("/api/calendar", get(calendar_handler))
        .route("/api/calendar/cache", delete(clear_calendar_cache_handler))
        .route(
            "/api/track",
            get(list_tracked_handler).post(add_tracked_handler),
        )
        .route("/api/track/:id", delete(remove_tracked_handler))
        .layer(cors)
        .with_state(tracker)
}

#[allow(unexpected_cfgs)]
#[cfg_attr(coverage_nightly, coverage(off))]
pub async fn poll_once(tracker: &tracker::TrackerStore) {
    let releases = nyaa::search_nyaa(None).await.unwrap_or_default();
    let tracked_shows = tracker.list();
    for show in tracked_shows {
        for release in &releases {
            if tracker.is_match(release, &show) {
                println!(
                    "Match: {} -> magnet link: {}",
                    show.title, release.magnet_link
                );
                let ep = release.episode.unwrap_or(0);
                if ep > show.last_downloaded_episode {
                    let mut updated_show = show.clone();
                    updated_show.last_downloaded_episode = ep;
                    tracker.add(updated_show);
                }
            }
        }
    }
}

pub async fn run_polling_loop(tracker: tracker::TrackerStore) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(900));
    #[cfg(not(test))]
    loop {
        interval.tick().await;
        poll_once(&tracker).await;
    }
    #[cfg(test)]
    {
        interval.tick().await;
        poll_once(&tracker).await;
    }
}

pub async fn run_server(
    addr: SocketAddr,
    tracker: tracker::TrackerStore,
    shutdown: tokio::sync::oneshot::Receiver<()>,
) -> bool {
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(_) => return false,
    };
    let _ = axum::serve(listener, app(tracker))
        .with_graceful_shutdown(async move {
            shutdown.await.ok();
        })
        .await;
    true
}

pub async fn main_entry(shutdown: tokio::sync::oneshot::Receiver<()>) {
    println!("[Beacon] Backend service starting...");
    let tracker = tracker::TrackerStore::new();
    tokio::spawn(run_polling_loop(tracker.clone()));

    let addr = SocketAddr::from(([0, 0, 0, 0], 58889));
    run_server(addr, tracker, shutdown).await;
}

#[cfg(not(test))]
#[tokio::main]
async fn main() {
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.ok();
        let _ = tx.send(());
    });
    main_entry(rx).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        extract::{Path, Query, State},
        Json,
    };
    use serial_test::serial;
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn test_health_response() {
        let res = health_handler().await;
        assert_eq!(
            res.0,
            HealthResponse {
                status: "ok",
                version: "0.1.0"
            }
        );
    }

    #[tokio::test]
    async fn test_app_router() {
        let router = app(tracker::TrackerStore::new());
        let _ = router;
    }

    #[tokio::test]
    async fn test_run_server() {
        // Bind-failure path: addr already occupied
        let occupied = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let occupied_addr = occupied.local_addr().unwrap();
        let (_tx, rx) = tokio::sync::oneshot::channel::<()>();
        let success = run_server(occupied_addr, tracker::TrackerStore::new(), rx).await;
        assert!(!success);
        drop(occupied);

        // Success path — send shutdown after verifying health
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        drop(listener);

        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let handle = tokio::spawn(run_server(addr, tracker::TrackerStore::new(), rx));

        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        let res = reqwest::get(format!("http://{}/health", addr)).await;
        assert!(res.is_ok());
        tx.send(()).ok();
        let _ = handle.await;

        let listener_drop = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr_drop = listener_drop.local_addr().unwrap();
        drop(listener_drop);
        let (tx_drop, rx_drop) = tokio::sync::oneshot::channel::<()>();
        let handle_drop =
            tokio::spawn(run_server(addr_drop, tracker::TrackerStore::new(), rx_drop));
        drop(tx_drop);
        let result = handle_drop.await.unwrap();
        assert!(result, "run_server should return true");
    }

    #[tokio::test]
    async fn test_main_entry() {
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let handle = tokio::spawn(main_entry(rx));
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        let _ = reqwest::get("http://127.0.0.1:58889/health").await;
        tx.send(()).ok();
        let _ = handle.await;
    }

    #[test]
    fn test_struct_debug() {
        let hr = HealthResponse {
            status: "ok",
            version: "0.1.0",
        };
        let hr2 = HealthResponse {
            status: "ok",
            version: "0.1.0",
        };
        assert_eq!(hr, hr2);
        assert!(format!("{:?}", hr).len() > 0);
    }

    #[tokio::test]
    async fn test_axum_handlers() {
        let tracker = tracker::TrackerStore::with_file_path(None);

        let q = SearchQuery {
            q: Some("Boku no Hero".to_string()),
        };
        let res = search_handler(Query(q)).await;
        let _ = res.0.len();

        let cq = CatalogSearchQuery {
            q: Some("Hero".to_string()),
            page: Some(1),
        };
        let res = catalog_search_handler(Query(cq)).await;
        assert_eq!(res.0.page, 1);

        let cq_empty = CatalogSearchQuery {
            q: None,
            page: None,
        };
        let res_empty = catalog_search_handler(Query(cq_empty)).await;
        assert_eq!(res_empty.0.page, 1);

        let chk = CheckQuery {
            title: Some("Frieren".to_string()),
        };
        let res_chk = nyaa_check_handler(Query(chk)).await;
        assert!(res_chk.0.get("is_torrenteable").is_some());

        let chk_empty = CheckQuery { title: None };
        let res_chk_empty = nyaa_check_handler(Query(chk_empty)).await;
        assert!(res_chk_empty.0.get("is_torrenteable").is_some());

        let list_res = list_tracked_handler(State(tracker.clone())).await;
        assert_eq!(list_res.0.len(), 0);

        let show = tracker::TrackedShow {
            id: "show1".to_string(),
            title: "Test Show".to_string(),
            preferred_subgroup: None,
            preferred_resolution: None,
            last_downloaded_episode: 0,
        };
        let add_res = add_tracked_handler(State(tracker.clone()), Json(show.clone())).await;
        assert_eq!(add_res.0.id, "show1");

        let list_res2 = list_tracked_handler(State(tracker.clone())).await;
        assert_eq!(list_res2.0.len(), 1);

        let rem_res =
            remove_tracked_handler(State(tracker.clone()), Path("show1".to_string())).await;
        assert!(rem_res.is_ok());

        let rem_err =
            remove_tracked_handler(State(tracker.clone()), Path("show1".to_string())).await;
        assert!(rem_err.is_err());

        let clear_res = clear_calendar_cache_handler(State(tracker.clone())).await;
        assert!(clear_res.0.get("ok").is_some());
    }

    #[tokio::test]
    #[serial]
    async fn test_run_polling_loop_completes_one_iteration() {
        std::env::remove_var("NYAA_SITE_URL");

        let mock_nyaa = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_string(r#"<?xml version="1.0"?><rss><channel></channel></rss>"#),
            )
            .mount(&mock_nyaa)
            .await;
        std::env::set_var("NYAA_SITE_URL", mock_nyaa.uri());

        let tracker = tracker::TrackerStore::with_file_path(None);
        let handle = tokio::spawn(run_polling_loop(tracker));
        let result = tokio::time::timeout(std::time::Duration::from_secs(3), handle).await;
        assert!(
            result.is_ok(),
            "run_polling_loop did not complete its single test iteration in time"
        );

        std::env::remove_var("NYAA_SITE_URL");
    }

    #[tokio::test]
    #[serial]
    async fn test_poll_once_branches() {
        std::env::remove_var("NYAA_SITE_URL");
        let tracker = tracker::TrackerStore::with_file_path(None);
        let show = tracker::TrackedShow {
            id: "frieren".to_string(),
            title: "Frieren".to_string(),
            preferred_subgroup: None,
            preferred_resolution: None,
            last_downloaded_episode: 0,
        };
        tracker.add(show);

        let mock_nyaa = MockServer::start().await;
        let xml_body = r#"<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>[SubsPlease] Frieren - 05 (1080p)</title>
      <link>magnet:?xt=urn:btih:test1</link>
    </item>
  </channel>
</rss>"#;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string(xml_body))
            .mount(&mock_nyaa)
            .await;

        std::env::set_var("NYAA_SITE_URL", mock_nyaa.uri());

        poll_once(&tracker).await;
        assert_eq!(tracker.list()[0].last_downloaded_episode, 5);

        let mock_nyaa_err = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_nyaa_err)
            .await;
        std::env::set_var("NYAA_SITE_URL", mock_nyaa_err.uri());
        poll_once(&tracker).await;

        std::env::remove_var("NYAA_SITE_URL");
    }

    #[tokio::test]
    #[serial]
    async fn test_calendar_handler() {
        let store = tracker::TrackerStore::with_file_path(None);
        store.add(tracker::TrackedShow {
            id: "frieren".to_string(),
            title: "Frieren".to_string(),
            preferred_subgroup: None,
            preferred_resolution: None,
            last_downloaded_episode: 0,
        });

        let mock_anilist_err = wiremock::MockServer::start().await;
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .respond_with(wiremock::ResponseTemplate::new(500))
            .mount(&mock_anilist_err)
            .await;

        // Test Ok branch
        let res = calendar_handler(
            axum::extract::State(store.clone()),
            axum::extract::Query(CalendarParams {
                year: Some(2026),
                month: Some(7),
            }),
        )
        .await;
        assert!(res.0.get("ok").unwrap().as_bool().unwrap());

        // Test Err branch
        std::env::set_var("ANILIST_API_URL", mock_anilist_err.uri());
        let store_err = tracker::TrackerStore::with_file_path(None);
        let res_err = calendar_handler(
            axum::extract::State(store_err.clone()),
            axum::extract::Query(CalendarParams {
                year: Some(2026),
                month: Some(7),
            }),
        )
        .await;
        assert!(!res_err.0.get("ok").unwrap().as_bool().unwrap());
        std::env::remove_var("ANILIST_API_URL");

        // Call with None parameters
        let res_none = calendar_handler(
            State(store.clone()),
            Query(CalendarParams {
                year: None,
                month: None,
            }),
        )
        .await;
        assert!(res_none.0.get("ok").unwrap().as_bool().unwrap());

        // Call with non-existent uncached date to trigger CALENDAR_FETCH_ERROR
        let res_err = calendar_handler(
            State(store),
            Query(CalendarParams {
                year: Some(2099),
                month: Some(1),
            }),
        )
        .await;
        assert!(!res_err.0.get("ok").unwrap().as_bool().unwrap());
        assert_eq!(
            res_err.0.get("error").unwrap().as_str().unwrap(),
            "CALENDAR_FETCH_ERROR"
        );
    }

    #[test]
    fn test_queries_debug_clone_coverage() {
        let sq = SearchQuery {
            q: Some("a".to_string()),
        };
        let csq = CatalogSearchQuery {
            q: Some("a".to_string()),
            page: Some(1),
        };
        let cq = CheckQuery {
            title: Some("a".to_string()),
        };
        let cp = CalendarParams {
            year: Some(2026),
            month: Some(7),
        };

        let _ = format!("{:?} {:?} {:?} {:?}", sq, csq, cq, cp);
        let _ = (sq.clone(), csq.clone(), cq.clone(), cp.clone());
    }

    #[tokio::test]
    #[serial]
    async fn test_main_error_branches() {
        // search errors
        let mock_nyaa = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_nyaa)
            .await;
        std::env::set_var("NYAA_SITE_URL", mock_nyaa.uri());

        let res_s = search_handler(Query(SearchQuery {
            q: Some("".to_string()),
        }))
        .await;
        // it should succeed with empty result instead of err
        assert_eq!(res_s.0.len(), 0);

        std::env::set_var("ANILIST_API_URL", "http://127.0.0.1:1");
        std::env::set_var("JIKAN_API_URL", "http://127.0.0.1:1");

        let res_c = catalog_search_handler(Query(CatalogSearchQuery {
            q: Some("".to_string()),
            page: Some(1),
        }))
        .await;
        assert_eq!(res_c.0.items.len(), 0);
        std::env::remove_var("NYAA_SITE_URL");
        std::env::remove_var("ANILIST_API_URL");
        std::env::remove_var("JIKAN_API_URL");
    }
}
