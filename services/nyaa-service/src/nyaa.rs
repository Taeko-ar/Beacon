use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NyaaRelease {
    pub title: String,
    pub magnet_link: String,
    pub subgroup: Option<String>,
    pub resolution: Option<String>,
    pub episode: Option<u32>,
}

static SUBGROUP_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\[(.*?)\]").unwrap());
static RES_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(1080p|720p|2160p|4k)").unwrap());
static EP_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:-|\bE|ep|\b)\s*(\d{2,4})\b").unwrap());

pub fn parse_nyaa_title(raw_title: &str, magnet: &str) -> NyaaRelease {
    let subgroup = SUBGROUP_RE
        .captures(raw_title)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string());

    let resolution = RES_RE
        .captures(&raw_title.to_lowercase())
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string());

    let episode = EP_RE
        .captures(raw_title)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse::<u32>().ok());

    NyaaRelease {
        title: raw_title.to_string(),
        magnet_link: magnet.to_string(),
        subgroup,
        resolution,
        episode,
    }
}

#[derive(Debug, Deserialize)]
struct RssItem {
    title: String,
    link: String,
}

#[derive(Debug, Deserialize)]
struct RssChannel {
    #[serde(rename = "item", default)]
    item: Vec<RssItem>,
}

#[derive(Debug, Deserialize)]
struct RssRoot {
    channel: RssChannel,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CatalogItem {
    pub id: String,
    pub title: String,
    pub image_url: Option<String>,
    pub synopsis: Option<String>,
    pub tags: Vec<String>,
    pub is_torrenteable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CatalogResponse {
    pub items: Vec<CatalogItem>,
    pub page: u32,
    pub has_next_page: bool,
}

pub async fn search_nyaa(query: Option<&str>) -> Result<Vec<NyaaRelease>, String> {
    let base_url =
        std::env::var("NYAA_SITE_URL").unwrap_or_else(|_| "https://nyaa.si/".to_string());
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap();
    let req = client.get(&base_url);
    let mut params = vec![("page", "rss"), ("c", "1_2")];
    if let Some(q) = query {
        params.push(("q", q));
    }

    let res = req.query(&params).send().await;
    let body = match res {
        Ok(response) => response.text().await.unwrap_or_default(),
        Err(_) => String::new(),
    };

    if !body.is_empty() {
        if let Ok(rss) = quick_xml::de::from_str::<RssRoot>(&body) {
            let releases: Vec<NyaaRelease> = rss
                .channel
                .item
                .into_iter()
                .map(|item| parse_nyaa_title(&item.title, &item.link))
                .collect();
            return Ok(releases);
        }
    }

    Ok(vec![])
}

pub async fn search_catalog(query: &str, page: Option<u32>) -> Result<CatalogResponse, String> {
    let p = page.unwrap_or(1);
    let anilist_url = std::env::var("ANILIST_API_URL")
        .unwrap_or_else(|_| "https://graphql.anilist.co".to_string());
    let jikan_url = std::env::var("JIKAN_API_URL")
        .unwrap_or_else(|_| "https://api.jikan.moe/v4/anime".to_string());

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap();

    // Try AniList GraphQL API first (Open CORS images, high rate limits, multi-item results)
    let graphql_query = r#"
    query ($search: String, $page: Int) {
      Page(page: $page, perPage: 20) {
        pageInfo {
          hasNextPage
        }
        media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
          id
          title {
            english
            romaji
          }
          coverImage {
            extraLarge
            large
          }
          description
          genres
        }
      }
    }
    "#;

    let payload = serde_json::json!({
        "query": graphql_query,
        "variables": {
            "search": query,
            "page": p
        }
    });

    if let Ok(res) = client.post(&anilist_url).json(&payload).send().await {
        if let Ok(json) = res.json::<serde_json::Value>().await {
            if let Some(resp) = parse_anilist_catalog_json(&json, p) {
                return Ok(resp);
            }
        }
    }

    // Secondary fallback: Jikan REST API
    let encoded_query = query.replace(' ', "%20");
    let url = if jikan_url.contains('?') {
        format!("{}&q={}&page={}", jikan_url, encoded_query, p)
    } else {
        format!("{}?q={}&page={}", jikan_url, encoded_query, p)
    };
    if let Ok(res) = client.get(&url).send().await {
        if let Ok(json) = res.json::<serde_json::Value>().await {
            if let Some(resp) = parse_jikan_catalog_json(&json, p) {
                return Ok(resp);
            }
        }
    }

    Ok(CatalogResponse {
        items: Vec::new(),
        page: p,
        has_next_page: false,
    })
}

pub fn parse_anilist_catalog_json(json: &serde_json::Value, page: u32) -> Option<CatalogResponse> {
    let page_data = json.get("data")?.get("Page")?;
    let has_next_page = page_data
        .get("pageInfo")
        .and_then(|pi| pi.get("hasNextPage"))
        .and_then(|h| h.as_bool())
        .unwrap_or(false);

    let media_list = page_data.get("media").and_then(|v| v.as_array())?;
    let items: Vec<CatalogItem> = media_list
        .iter()
        .filter_map(|item| {
            let id = item.get("id")?.to_string();
            let title = item
                .get("title")
                .and_then(|t| {
                    t.get("english")
                        .and_then(|v| v.as_str())
                        .or_else(|| t.get("romaji").and_then(|v| v.as_str()))
                })
                .unwrap_or("Unknown")
                .to_string();
            let image_url = item
                .get("coverImage")
                .and_then(|c| c.get("extraLarge").or_else(|| c.get("large")))
                .and_then(|u| u.as_str())
                .map(|s| s.to_string());
            let synopsis = item.get("description").and_then(|s| s.as_str()).map(|s| {
                s.replace("<br>", "\n")
                    .replace("<i>", "")
                    .replace("</i>", "")
                    .replace("<b>", "")
                    .replace("</b>", "")
            });
            let tags = item
                .get("genres")
                .and_then(|g| g.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            Some(CatalogItem {
                id,
                title,
                image_url,
                synopsis,
                tags,
                is_torrenteable: true,
            })
        })
        .collect();

    if items.is_empty() {
        None
    } else {
        Some(CatalogResponse {
            items,
            page,
            has_next_page,
        })
    }
}

pub fn parse_jikan_catalog_json(json: &serde_json::Value, page: u32) -> Option<CatalogResponse> {
    let has_next_page = json
        .get("pagination")
        .and_then(|pg| pg.get("has_next_page"))
        .and_then(|h| h.as_bool())
        .unwrap_or(false);

    let data = json.get("data")?.as_array()?;
    let items: Vec<CatalogItem> = data
        .iter()
        .filter_map(|item| {
            let id = item.get("mal_id")?.to_string();
            let title = item
                .get("title_english")
                .and_then(|v| v.as_str())
                .or_else(|| item.get("title").and_then(|v| v.as_str()))
                .unwrap_or("Unknown")
                .to_string();
            let image_url = item
                .get("images")
                .and_then(|i| i.get("jpg"))
                .and_then(|j| j.get("large_image_url").or_else(|| j.get("image_url")))
                .and_then(|u| u.as_str())
                .map(|s| s.to_string());
            let synopsis = item
                .get("synopsis")
                .and_then(|s| s.as_str())
                .map(|s| s.to_string());
            let tags = item
                .get("genres")
                .and_then(|g| g.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|genre| genre.get("name")?.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            Some(CatalogItem {
                id,
                title,
                image_url,
                synopsis,
                tags,
                is_torrenteable: true,
            })
        })
        .collect();

    if items.is_empty() {
        None
    } else {
        Some(CatalogResponse {
            items,
            page,
            has_next_page,
        })
    }
}

pub async fn check_nyaa_torrenteable(title: &str) -> Result<bool, String> {
    search_nyaa(Some(title)).await.map(|r| !r.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    fn test_nyaa_models_debug_clone() {
        let release = NyaaRelease {
            title: "Test".to_string(),
            magnet_link: "magnet:test".to_string(),
            subgroup: Some("Sub".to_string()),
            resolution: Some("1080p".to_string()),
            episode: Some(1),
        };
        let _rel_clone = release.clone();
        assert_eq!(release, _rel_clone);
        let _rel_dbg = format!("{:?}", release);
        let rel_json = serde_json::to_string(&release).unwrap();
        let _rel_de: NyaaRelease = serde_json::from_str(&rel_json).unwrap();

        let item = CatalogItem {
            id: "1".to_string(),
            title: "Item".to_string(),
            image_url: Some("url".to_string()),
            synopsis: Some("syn".to_string()),
            tags: vec!["tag".to_string()],
            is_torrenteable: true,
        };
        let _item_clone = item.clone();
        assert_eq!(item, _item_clone);
        let _item_dbg = format!("{:?}", item);
        let item_json = serde_json::to_string(&item).unwrap();
        let _item_de: CatalogItem = serde_json::from_str(&item_json).unwrap();

        let resp = CatalogResponse {
            items: vec![item],
            page: 1,
            has_next_page: false,
        };
        let _resp_clone = resp.clone();
        assert_eq!(resp, _resp_clone);
        let _resp_dbg = format!("{:?}", resp);
        let resp_json = serde_json::to_string(&resp).unwrap();
        let _resp_de: CatalogResponse = serde_json::from_str(&resp_json).unwrap();
    }

    #[test]
    fn test_parse_nyaa_title_full() {
        let title = "[SubsPlease] Frieren - 05 (1080p) [ABCD1234].mkv";
        let magnet = "magnet:?xt=urn:btih:test";
        let release = parse_nyaa_title(title, magnet);

        assert_eq!(release.subgroup, Some("SubsPlease".to_string()));
        assert_eq!(release.resolution, Some("1080p".to_string()));
        assert_eq!(release.episode, Some(5));
    }

    #[test]
    fn test_parse_nyaa_title_none() {
        let title = "Frieren Movie.mkv";
        let magnet = "magnet:?xt=urn:btih:test";
        let release = parse_nyaa_title(title, magnet);

        assert_eq!(release.subgroup, None);
        assert_eq!(release.resolution, None);
        assert_eq!(release.episode, None);
    }

    #[test]
    fn test_xml_deserialization() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Nyaa - Anime</title>
    <item>
      <title>[SubsPlease] Frieren - 05 (1080p)</title>
      <link>magnet:?xt=urn:btih:test1</link>
    </item>
    <item>
      <title>Jujutsu Kaisen - S02E10 (720p)</title>
      <link>magnet:?xt=urn:btih:test2</link>
    </item>
  </channel>
</rss>"#;
        let rss: RssRoot = quick_xml::de::from_str(xml).unwrap();
        assert_eq!(rss.channel.item.len(), 2);
        assert_eq!(rss.channel.item[1].link, "magnet:?xt=urn:btih:test2");
        let _ = format!("{:?}", rss);
        let _ = format!("{:?}", rss.channel);
        let _ = format!("{:?}", rss.channel.item[0]);

        let default_item = RssItem {
            title: "T".to_string(),
            link: "L".to_string(),
        };
        let _item_dbg = format!("{:?}", default_item);
        let default_channel = RssChannel {
            item: vec![default_item],
        };
        let _chan_dbg = format!("{:?}", default_channel);
        let default_root = RssRoot {
            channel: default_channel,
        };
        let _root_dbg = format!("{:?}", default_root);
    }

    #[tokio::test]
    #[serial]
    async fn test_search_nyaa_none() {
        let mock_nyaa = wiremock::MockServer::start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_string(
                r#"<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>"#,
            ))
            .mount(&mock_nyaa)
            .await;
        std::env::set_var("NYAA_SITE_URL", mock_nyaa.uri());
        let _ = search_nyaa(None).await;
        std::env::remove_var("NYAA_SITE_URL");
    }

    #[test]
    fn test_parse_anilist_catalog_json() {
        let json = serde_json::json!({
            "data": {
                "Page": {
                    "pageInfo": { "hasNextPage": true },
                    "media": [
                        {
                            "id": 101,
                            "title": { "english": "English Title", "romaji": "Romaji Title" },
                            "coverImage": { "extraLarge": "http://example.com/extra.jpg" },
                            "description": "Synopsis <i>test</i>",
                            "genres": ["Action", "Fantasy"]
                        }
                    ]
                }
            }
        });

        let res = parse_anilist_catalog_json(&json, 1).unwrap();
        assert_eq!(res.items.len(), 1);
        assert_eq!(res.items[0].title, "English Title");
        assert!(res.has_next_page);
        assert_eq!(res.items[0].synopsis, Some("Synopsis test".to_string()));
        let json_romaji = serde_json::json!({
            "data": {
                "Page": {
                    "media": [
                        {
                            "id": 102,
                            "title": { "romaji": "Romaji Only Title" },
                            "coverImage": { "large": "http://example.com/large.jpg" }
                        }
                    ]
                }
            }
        });
        let res_romaji = parse_anilist_catalog_json(&json_romaji, 1).unwrap();
        assert_eq!(res_romaji.items[0].title, "Romaji Only Title");
        assert_eq!(
            res_romaji.items[0].image_url,
            Some("http://example.com/large.jpg".to_string())
        );

        // Media item without English/Romaji title ("Unknown") and without id (skipped)
        let json_unknown = serde_json::json!({
            "data": {
                "Page": {
                    "media": [
                        { "id": 103 },
                        { "title": { "english": "No ID Show" } }
                    ]
                }
            }
        });
        let res_unknown = parse_anilist_catalog_json(&json_unknown, 1).unwrap();
        assert_eq!(res_unknown.items[0].title, "Unknown");
        assert_eq!(res_unknown.items.len(), 1);

        // Media item with large image URL fallback
        let json_large_img = serde_json::json!({
            "data": {
                "Page": {
                    "media": [
                        {
                            "id": 104,
                            "title": { "english": "Large Image Show" },
                            "coverImage": { "large": "http://example.com/large.jpg" }
                        }
                    ]
                }
            }
        });
        let res_large = parse_anilist_catalog_json(&json_large_img, 1).unwrap();
        assert_eq!(
            res_large.items[0].image_url,
            Some("http://example.com/large.jpg".to_string())
        );

        // Non-array media field in AniList
        let json_non_array_media = serde_json::json!({
            "data": {
                "Page": {
                    "media": "not_an_array"
                }
            }
        });
        assert!(parse_anilist_catalog_json(&json_non_array_media, 1).is_none());

        // Invalid JSON fallback
        assert!(parse_anilist_catalog_json(&serde_json::json!({}), 1).is_none());
    }

    #[test]
    fn test_parse_jikan_catalog_json() {
        let json = serde_json::json!({
            "pagination": { "has_next_page": false },
            "data": [
                {
                    "mal_id": 202,
                    "title": "Jikan Title",
                    "images": { "jpg": { "image_url": "http://example.com/jikan.jpg" } },
                    "synopsis": "Jikan Synopsis",
                    "genres": [{ "name": "Adventure" }, {}, { "name": 123 }]
                }
            ]
        });

        let res = parse_jikan_catalog_json(&json, 1).unwrap();
        assert_eq!(res.items.len(), 1);
        assert_eq!(res.items[0].title, "Jikan Title");
        assert!(!res.has_next_page);

        // Media item without title ("Unknown") and without mal_id (skipped)
        let json_unknown = serde_json::json!({
            "data": [
                { "mal_id": 203 },
                { "title": "No ID Show" }
            ]
        });
        let res_unknown = parse_jikan_catalog_json(&json_unknown, 1).unwrap();
        assert_eq!(res_unknown.items[0].title, "Unknown");
        assert_eq!(res_unknown.items.len(), 1);

        // Media item with large_image_url
        let json_large_img = serde_json::json!({
            "data": [
                {
                    "mal_id": 204,
                    "title_english": "Large Image Show",
                    "images": { "jpg": { "large_image_url": "http://example.com/large_jikan.jpg" } }
                }
            ]
        });
        let res_large = parse_jikan_catalog_json(&json_large_img, 1).unwrap();
        assert_eq!(
            res_large.items[0].image_url,
            Some("http://example.com/large_jikan.jpg".to_string())
        );

        // Media item with title_english
        let json_eng = serde_json::json!({
            "data": [
                {
                    "mal_id": 204,
                    "title_english": "English Jikan Title",
                    "title": "Jikan Title"
                }
            ]
        });
        let res_eng = parse_jikan_catalog_json(&json_eng, 1).unwrap();
        assert_eq!(res_eng.items[0].title, "English Jikan Title");

        // Non-array data field in Jikan
        let json_non_array_data = serde_json::json!({
            "data": "not_an_array"
        });
        assert!(parse_jikan_catalog_json(&json_non_array_data, 1).is_none());

        // Invalid JSON fallback
        assert!(parse_jikan_catalog_json(&serde_json::json!({}), 1).is_none());
    }

    #[tokio::test]
    #[serial]
    async fn test_search_catalog_with_mock_servers() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let mock_anilist = MockServer::start().await;
        let mock_jikan = MockServer::start().await;

        let anilist_body = serde_json::json!({
            "data": {
                "Page": {
                    "pageInfo": { "hasNextPage": false },
                    "media": [
                        {
                            "id": 555,
                            "title": { "english": "AniList Mock Show" }
                        }
                    ]
                }
            }
        });

        Mock::given(method("POST"))
            .and(path("/graphql"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&anilist_body))
            .mount(&mock_anilist)
            .await;

        std::env::set_var("ANILIST_API_URL", format!("{}/graphql", mock_anilist.uri()));
        std::env::set_var("JIKAN_API_URL", format!("{}/jikan", mock_jikan.uri()));

        let catalog_res = search_catalog("Mock Search", Some(1)).await.unwrap();
        assert_eq!(catalog_res.items.len(), 1);
        assert_eq!(catalog_res.items[0].title, "AniList Mock Show");

        // AniList fails, fallback to Jikan
        let mock_anilist_fail = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_anilist_fail)
            .await;

        let jikan_body = serde_json::json!({
            "pagination": { "has_next_page": false },
            "data": [
                {
                    "mal_id": 777,
                    "title": "Jikan Mock Show"
                }
            ]
        });

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(&jikan_body))
            .mount(&mock_jikan)
            .await;

        // AniList returns 200 OK with empty media list, fallback to Jikan
        let mock_anilist_empty = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": { "Page": { "media": [] } }
            })))
            .mount(&mock_anilist_empty)
            .await;

        std::env::set_var(
            "ANILIST_API_URL",
            format!("{}/graphql", mock_anilist_empty.uri()),
        );

        let catalog_jikan_res = search_catalog("Mock Search", Some(1)).await.unwrap();
        assert_eq!(catalog_jikan_res.items.len(), 1);
        assert_eq!(catalog_jikan_res.items[0].title, "Jikan Mock Show");

        // Both return 200 OK with empty arrays
        let mock_jikan_empty = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": []
            })))
            .mount(&mock_jikan_empty)
            .await;
        std::env::set_var(
            "JIKAN_API_URL",
            format!("{}/jikan?query=1", mock_jikan_empty.uri()),
        );

        let empty_catalog = search_catalog("Mock Search", None).await.unwrap();
        assert_eq!(empty_catalog.items.len(), 0);

        // AniList and Jikan return invalid JSON structure (parse returns None)
        let mock_anilist_invalid = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": "invalid_shape"
            })))
            .mount(&mock_anilist_invalid)
            .await;

        let mock_jikan_invalid = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": "invalid_shape"
            })))
            .mount(&mock_jikan_invalid)
            .await;

        std::env::set_var(
            "ANILIST_API_URL",
            format!("{}/graphql", mock_anilist_invalid.uri()),
        );
        std::env::set_var(
            "JIKAN_API_URL",
            format!("{}/jikan", mock_jikan_invalid.uri()),
        );

        let invalid_shape_catalog = search_catalog("Mock Search", Some(1)).await.unwrap();
        assert_eq!(invalid_shape_catalog.items.len(), 0);

        // AniList returns empty media list
        let empty_media_json = serde_json::json!({
            "data": {
                "Page": {
                    "pageInfo": { "hasNextPage": false },
                    "media": []
                }
            }
        });
        assert!(parse_anilist_catalog_json(&empty_media_json, 1).is_none());

        // AniList and Jikan return HTTP 200 with non-JSON text body (res.json() returns Err)
        let mock_anilist_text = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not json content"))
            .mount(&mock_anilist_text)
            .await;

        let mock_jikan_text = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not json content"))
            .mount(&mock_jikan_text)
            .await;

        std::env::set_var(
            "ANILIST_API_URL",
            format!("{}/graphql", mock_anilist_text.uri()),
        );
        std::env::set_var("JIKAN_API_URL", format!("{}/jikan", mock_jikan_text.uri()));

        let invalid_json_catalog = search_catalog("Mock Search", Some(1)).await.unwrap();
        assert_eq!(invalid_json_catalog.items.len(), 0);

        // Network error for both AniList and Jikan
        std::env::set_var("ANILIST_API_URL", "http://127.0.0.1:59999/graphql");
        std::env::set_var("JIKAN_API_URL", "http://127.0.0.1:59999/jikan");
        let net_err_catalog = search_catalog("Mock Search", Some(1)).await.unwrap();
        assert_eq!(net_err_catalog.items.len(), 0);

        std::env::remove_var("ANILIST_API_URL");
        std::env::remove_var("JIKAN_API_URL");
    }

    #[tokio::test]
    #[serial]
    async fn test_search_nyaa_with_mock_server() {
        std::env::remove_var("NYAA_SITE_URL");
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let mock_nyaa = MockServer::start().await;

        let xml_body = r#"<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Nyaa - Anime</title>
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

        let releases = search_nyaa(Some("Frieren")).await.unwrap();
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].subgroup, Some("SubsPlease".to_string()));
        assert!(releases[0].title.to_lowercase().contains("frieren"));

        let releases_none = search_nyaa(None).await.unwrap();
        assert_eq!(releases_none.len(), 1);

        // Torrenteable test (with valid mock_nyaa)
        assert!(check_nyaa_torrenteable("Frieren").await.unwrap());

        // Invalid XML test
        let mock_nyaa_fail = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not xml"))
            .mount(&mock_nyaa_fail)
            .await;
        std::env::set_var("NYAA_SITE_URL", mock_nyaa_fail.uri());

        let invalid_releases = search_nyaa(Some("Frieren")).await.unwrap();
        assert_eq!(invalid_releases.len(), 0);

        // Empty RSS items test
        let mock_nyaa_empty = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>"#,
            ))
            .mount(&mock_nyaa_empty)
            .await;
        std::env::set_var("NYAA_SITE_URL", mock_nyaa_empty.uri());
        let empty_xml_releases = search_nyaa(Some("Frieren")).await.unwrap();
        assert_eq!(empty_xml_releases.len(), 0);
        assert!(!check_nyaa_torrenteable("NonExistent").await.unwrap());

        // Network error 500 test
        let mock_nyaa_500 = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_nyaa_500)
            .await;
        std::env::set_var("NYAA_SITE_URL", mock_nyaa_500.uri());
        let err_releases = search_nyaa(Some("Frieren")).await;
        assert_eq!(err_releases.unwrap().len(), 0);

        // Connection refused test
        std::env::set_var("NYAA_SITE_URL", "http://127.0.0.1:59999".to_string());
        assert_eq!(search_nyaa(Some("Test")).await.unwrap().len(), 0);

        std::env::remove_var("NYAA_SITE_URL");
    }

    #[test]
    fn test_catalog_parsers_edge_cases() {
        // AniList fallback branches
        let json_romaji = serde_json::json!({
            "data": {
                "Page": {
                    "pageInfo": { "hasNextPage": false },
                    "media": [
                        {
                            "id": 202,
                            "title": { "romaji": "Romaji Only" },
                            "coverImage": { "large": "http://example.com/large.jpg" },
                            "description": "Bold <b>text</b>",
                            "genres": ["Sci-Fi", 123]
                        },
                        {
                            "id": 203,
                            "title": {},
                            "coverImage": null,
                            "genres": null
                        }
                    ]
                }
            }
        });
        let res = parse_anilist_catalog_json(&json_romaji, 2).unwrap();
        assert_eq!(res.items.len(), 2);
        assert_eq!(res.items[0].title, "Romaji Only");
        assert_eq!(
            res.items[0].image_url,
            Some("http://example.com/large.jpg".to_string())
        );
        assert_eq!(res.items[1].title, "Unknown");
        assert_eq!(res.items[1].image_url, None);

        // Jikan fallback branches
        let jikan_json = serde_json::json!({
            "pagination": { "has_next_page": true },
            "data": [
                {
                    "mal_id": 301,
                    "title_english": "English Jikan",
                    "images": { "jpg": { "large_image_url": "http://example.com/jikan.jpg" } },
                    "synopsis": "Synopsis",
                    "genres": [{ "name": "Action" }]
                },
                {
                    "mal_id": 302,
                    "title": "Default Jikan",
                    "images": { "jpg": { "image_url": "http://example.com/small.jpg" } },
                    "genres": []
                },
                {
                    "mal_id": 303,
                    "title": null
                }
            ]
        });
        let jres = parse_jikan_catalog_json(&jikan_json, 1).unwrap();
        assert_eq!(jres.items.len(), 3);
        assert_eq!(jres.items[0].title, "English Jikan");
        assert_eq!(jres.items[1].title, "Default Jikan");
        assert_eq!(jres.items[2].title, "Unknown");

        // Struct derive coverage
        let cat_item = CatalogItem {
            id: "1".to_string(),
            title: "t".to_string(),
            image_url: None,
            synopsis: None,
            tags: vec![],
            is_torrenteable: true,
        };
        let cat_resp = CatalogResponse {
            items: vec![cat_item.clone()],
            page: 1,
            has_next_page: false,
        };
        let _ = (cat_item.clone(), cat_resp.clone());
        let _ = format!("{:?} {:?}", cat_item, cat_resp);

        let nr = NyaaRelease {
            title: "t".to_string(),
            magnet_link: "m".to_string(),
            subgroup: Some("s".to_string()),
            resolution: Some("r".to_string()),
            episode: Some(1),
        };
        let s_nr = serde_json::to_string(&nr).unwrap();
        let _: NyaaRelease = serde_json::from_str(&s_nr).unwrap();

        let s_item = serde_json::to_string(&cat_item).unwrap();
        let _: CatalogItem = serde_json::from_str(&s_item).unwrap();

        let s_resp = serde_json::to_string(&cat_resp).unwrap();
        let _: CatalogResponse = serde_json::from_str(&s_resp).unwrap();

        // Inequality comparisons (ne method coverage)
        let cat_item_diff = CatalogItem {
            id: "2".to_string(),
            ..cat_item.clone()
        };
        assert_ne!(cat_item, cat_item_diff);

        let cat_resp_diff = CatalogResponse {
            page: 2,
            ..cat_resp.clone()
        };
        assert_ne!(cat_resp, cat_resp_diff);

        let nr_diff = NyaaRelease {
            title: "diff".to_string(),
            ..nr.clone()
        };
        assert_ne!(nr, nr_diff);
    }

    #[test]
    fn test_parse_anilist_catalog_json_additional_branches() {
        // Description as non-string, coverImage with only medium, title with non-strings, genres non-array
        let json = serde_json::json!({
            "data": {
                "Page": {
                    "pageInfo": null,
                    "media": [
                        {
                            "id": 999,
                            "title": { "english": 123, "romaji": true },
                            "coverImage": { "medium": "http://example.com/medium.jpg" },
                            "description": 12345,
                            "genres": "not_an_array"
                        },
                        {
                            "id": 1000,
                            "coverImage": "not_an_object"
                        }
                    ]
                }
            }
        });
        let res = parse_anilist_catalog_json(&json, 1).unwrap();
        assert_eq!(res.items.len(), 2);
        assert!(!res.has_next_page);
        assert_eq!(res.items[0].title, "Unknown");
        assert_eq!(res.items[0].image_url, None);
        assert_eq!(res.items[0].synopsis, None);
        assert_eq!(res.items[0].tags.len(), 0);
        assert_eq!(res.items[1].image_url, None);
    }

    #[test]
    fn test_parse_jikan_catalog_json_additional_branches() {
        // pagination null, title_english/title non-string, images jpg without large/normal image url
        let json = serde_json::json!({
            "pagination": null,
            "data": [
                {
                    "mal_id": 888,
                    "title_english": 123,
                    "title": true,
                    "images": { "jpg": { "small_image_url": "http://example.com/small.jpg" } },
                    "genres": "not_an_array"
                },
                {
                    "mal_id": 889,
                    "images": "not_an_object"
                }
            ]
        });
        let res = parse_jikan_catalog_json(&json, 1).unwrap();
        assert_eq!(res.items.len(), 2);
        assert!(!res.has_next_page);
        assert_eq!(res.items[0].title, "Unknown");
        assert_eq!(res.items[0].image_url, None);
        assert_eq!(res.items[0].tags.len(), 0);
        assert_eq!(res.items[1].image_url, None);
    }

    #[tokio::test]
    #[serial]
    async fn test_search_nyaa_text_decode_error() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let mock_server = MockServer::start().await;
        // Mock server sends Content-Length larger than body bytes causing response text decoding error
        Mock::given(method("GET"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-length", "100000")
                    .set_body_bytes(vec![60, 63, 120, 109, 108]),
            )
            .mount(&mock_server)
            .await;

        std::env::set_var("NYAA_SITE_URL", mock_server.uri());
        let res = search_nyaa(Some("test")).await.unwrap();
        assert_eq!(res.len(), 0);
        std::env::remove_var("NYAA_SITE_URL");
    }

    #[tokio::test]
    #[serial]
    async fn test_search_catalog_fallbacks() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let mock_server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_server)
            .await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_server)
            .await;

        std::env::set_var("ANILIST_API_URL", mock_server.uri());
        std::env::set_var("JIKAN_API_URL", mock_server.uri());

        let res = search_catalog("query with spaces", None).await.unwrap();
        assert_eq!(res.items.len(), 0);

        std::env::remove_var("ANILIST_API_URL");
        std::env::remove_var("JIKAN_API_URL");
    }
}
