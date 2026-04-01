use super::types::{MbAlbum, MbArtist};

const MB_USER_AGENT: &str = "GuteMusik/1.0 (https://github.com/gutemusik)";

async fn mb_get_async(url: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .header("User-Agent", MB_USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("MusicBrainz request failed: {e}"))?;
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;
    serde_json::from_str(&body).map_err(|e| format!("Failed to parse JSON: {e}"))
}

/// Blocking variant for use from worker threads.
pub fn mb_get(url: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::blocking::Client::new();
    let resp = client
        .get(url)
        .header("User-Agent", MB_USER_AGENT)
        .send()
        .map_err(|e| format!("MusicBrainz request failed: {e}"))?;
    let body = resp
        .text()
        .map_err(|e| format!("Failed to read response: {e}"))?;
    serde_json::from_str(&body).map_err(|e| format!("Failed to parse JSON: {e}"))
}

pub async fn search_artist_async(artist: &str) -> Result<Vec<MbArtist>, String> {
    let encoded = urlencoding::encode(artist);
    let url = format!(
        "https://musicbrainz.org/ws/2/artist/?query={encoded}&fmt=json&limit=8"
    );
    let data = mb_get_async(&url).await?;

    let artists = data["artists"]
        .as_array()
        .ok_or("No artists in response")?;

    let results: Vec<MbArtist> = artists
        .iter()
        .filter_map(|a| {
            Some(MbArtist {
                id: a["id"].as_str()?.to_string(),
                name: a["name"].as_str()?.to_string(),
                disambiguation: a["disambiguation"].as_str().unwrap_or("").to_string(),
            })
        })
        .collect();

    Ok(results)
}

pub async fn get_discography_async(artist_id: &str) -> Result<Vec<MbAlbum>, String> {
    let mut all_albums: Vec<MbAlbum> = Vec::new();
    let mut offset = 0;
    let limit = 100;

    loop {
        let url = format!(
            "https://musicbrainz.org/ws/2/release-group/?artist={artist_id}&fmt=json&limit={limit}&offset={offset}"
        );
        let data = mb_get_async(&url).await?;

        let groups = data["release-groups"]
            .as_array()
            .ok_or("No release-groups in response")?;

        if groups.is_empty() {
            break;
        }

        for rg in groups {
            let title = match rg["title"].as_str() {
                Some(t) => t.to_string(),
                None => continue,
            };
            let id = match rg["id"].as_str() {
                Some(i) => i.to_string(),
                None => continue,
            };
            let year = rg["first-release-date"]
                .as_str()
                .unwrap_or("")
                .chars()
                .take(4)
                .collect::<String>();
            let primary_type = rg["primary-type"]
                .as_str()
                .unwrap_or("")
                .to_string();
            let secondary_types: Vec<String> = rg["secondary-types"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            all_albums.push(MbAlbum {
                id,
                title,
                year,
                release_type: primary_type,
                secondary_types,
            });
        }

        let total = data["release-group-count"].as_u64().unwrap_or(0) as usize;
        offset += limit;
        if offset >= total {
            break;
        }

        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    all_albums.sort_by(|a, b| a.year.cmp(&b.year));
    all_albums.dedup_by(|a, b| a.title.to_lowercase() == b.title.to_lowercase());

    Ok(all_albums)
}

/// Fetch the English Wikipedia URL for an artist from their MusicBrainz
/// URL relations.
pub async fn get_artist_wikipedia_url(artist_id: &str) -> Option<String> {
    let url = format!(
        "https://musicbrainz.org/ws/2/artist/{artist_id}?inc=url-rels&fmt=json"
    );
    let data = mb_get_async(&url).await.ok()?;

    let relations = data["relations"].as_array()?;
    for rel in relations {
        let rel_type = rel["type"].as_str().unwrap_or("");
        if rel_type == "wikipedia" {
            let resource = rel["url"]["resource"].as_str()?;
            // Prefer English Wikipedia
            if resource.contains("en.wikipedia.org") {
                return Some(resource.to_string());
            }
        }
    }

    // Fall back to any Wikipedia link
    for rel in relations {
        let rel_type = rel["type"].as_str().unwrap_or("");
        if rel_type == "wikipedia" {
            if let Some(resource) = rel["url"]["resource"].as_str() {
                return Some(resource.to_string());
            }
        }
    }

    None
}

pub fn fetch_tracklist(artist: &str, album: &str) -> Result<Vec<String>, String> {
    let query_str = format!("release:{album} AND artist:{artist}");
    let encoded = urlencoding::encode(&query_str);
    let url = format!(
        "https://musicbrainz.org/ws/2/release/?query={encoded}&fmt=json&limit=1"
    );
    let data = mb_get(&url)?;

    let release_id = data["releases"]
        .as_array()
        .and_then(|r| r.first())
        .and_then(|r| r["id"].as_str())
        .ok_or("No release found on MusicBrainz")?
        .to_string();

    std::thread::sleep(std::time::Duration::from_secs(1));

    let url2 = format!(
        "https://musicbrainz.org/ws/2/release/{release_id}?inc=recordings&fmt=json"
    );
    let data2 = mb_get(&url2)?;

    let mut tracks = Vec::new();
    if let Some(media) = data2["media"].as_array() {
        for medium in media {
            if let Some(medium_tracks) = medium["tracks"].as_array() {
                for track in medium_tracks {
                    if let Some(title) = track["title"].as_str() {
                        tracks.push(title.to_string());
                    }
                }
            }
        }
    }

    if tracks.is_empty() {
        return Err("No tracks found on MusicBrainz".into());
    }

    Ok(tracks)
}

/// Parse artist search results from MusicBrainz JSON response.
pub fn parse_artist_results(data: &serde_json::Value) -> Vec<MbArtist> {
    data["artists"]
        .as_array()
        .map(|artists| {
            artists
                .iter()
                .filter_map(|a| {
                    Some(MbArtist {
                        id: a["id"].as_str()?.to_string(),
                        name: a["name"].as_str()?.to_string(),
                        disambiguation: a["disambiguation"].as_str().unwrap_or("").to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Parse discography results from MusicBrainz JSON response.
pub fn parse_release_groups(data: &serde_json::Value) -> Vec<MbAlbum> {
    data["release-groups"]
        .as_array()
        .map(|groups| {
            groups
                .iter()
                .filter_map(|rg| {
                    let title = rg["title"].as_str()?.to_string();
                    let id = rg["id"].as_str()?.to_string();
                    let year = rg["first-release-date"]
                        .as_str()
                        .unwrap_or("")
                        .chars()
                        .take(4)
                        .collect::<String>();
                    let primary_type = rg["primary-type"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    let secondary_types: Vec<String> = rg["secondary-types"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default();
                    Some(MbAlbum {
                        id,
                        title,
                        year,
                        release_type: primary_type,
                        secondary_types,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Parse tracklist from MusicBrainz release JSON response.
pub fn parse_tracklist(data: &serde_json::Value) -> Vec<String> {
    let mut tracks = Vec::new();
    if let Some(media) = data["media"].as_array() {
        for medium in media {
            if let Some(medium_tracks) = medium["tracks"].as_array() {
                for track in medium_tracks {
                    if let Some(title) = track["title"].as_str() {
                        tracks.push(title.to_string());
                    }
                }
            }
        }
    }
    tracks
}

pub fn fetch_cover(artist: &str, album: &str) -> Option<Vec<u8>> {
    let query_str = format!("release:{album} AND artist:{artist}");
    let encoded = urlencoding::encode(&query_str);
    let url = format!(
        "https://musicbrainz.org/ws/2/release-group/?query={encoded}&fmt=json&limit=1"
    );
    let data = mb_get(&url).ok()?;

    let rg_id = data["release-groups"]
        .as_array()?
        .first()?["id"]
        .as_str()?;

    let cover_url = format!("https://coverartarchive.org/release-group/{rg_id}/front-500");
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .ok()?;

    let resp = client
        .get(&cover_url)
        .header("User-Agent", MB_USER_AGENT)
        .send()
        .ok()?;

    if resp.status().is_success() {
        let bytes = resp.bytes().ok()?;
        if bytes.len() > 3 && (bytes[0..2] == [0xFF, 0xD8] || bytes[0..3] == [0x89, 0x50, 0x4E]) {
            return Some(bytes.to_vec());
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_agent_header() {
        assert!(MB_USER_AGENT.contains("GuteMusik"));
        assert!(MB_USER_AGENT.contains("github.com"));
    }

    #[test]
    fn test_search_artist_url() {
        let artist = "Miles Davis";
        let encoded = urlencoding::encode(artist);
        let url = format!(
            "https://musicbrainz.org/ws/2/artist/?query={encoded}&fmt=json&limit=8"
        );
        assert!(url.contains("Miles%20Davis"));
        assert!(url.contains("fmt=json"));
        assert!(url.contains("limit=8"));
    }

    #[test]
    fn test_search_artist_parse_response() {
        let data: serde_json::Value = serde_json::from_str(
            r#"{
                "artists": [
                    {"id": "561d854a", "name": "Miles Davis", "disambiguation": "jazz trumpeter"},
                    {"id": "fake-id", "name": "Miles Davis Quintet", "disambiguation": ""}
                ]
            }"#,
        )
        .unwrap();
        let results = parse_artist_results(&data);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].name, "Miles Davis");
        assert_eq!(results[0].disambiguation, "jazz trumpeter");
        assert_eq!(results[1].name, "Miles Davis Quintet");
    }

    #[test]
    fn test_get_discography_url() {
        let artist_id = "561d854a-6a28-4aa7-8c99-323e6ce46c2a";
        let url = format!(
            "https://musicbrainz.org/ws/2/release-group/?artist={artist_id}&fmt=json&limit=100&offset=0"
        );
        assert!(url.contains(artist_id));
        assert!(url.contains("release-group"));
        assert!(url.contains("fmt=json"));
    }

    #[test]
    fn test_get_discography_parse() {
        let data: serde_json::Value = serde_json::from_str(
            r#"{
                "release-groups": [
                    {
                        "id": "rg1",
                        "title": "Kind of Blue",
                        "first-release-date": "1959-08-17",
                        "primary-type": "Album",
                        "secondary-types": []
                    },
                    {
                        "id": "rg2",
                        "title": "Bitches Brew",
                        "first-release-date": "1970-03-30",
                        "primary-type": "Album",
                        "secondary-types": ["Live"]
                    }
                ],
                "release-group-count": 2
            }"#,
        )
        .unwrap();
        let albums = parse_release_groups(&data);
        assert_eq!(albums.len(), 2);
        assert_eq!(albums[0].title, "Kind of Blue");
        assert_eq!(albums[0].year, "1959");
        assert_eq!(albums[0].release_type, "Album");
        assert_eq!(albums[1].secondary_types, vec!["Live"]);
    }

    #[test]
    fn test_get_tracklist_url() {
        let artist = "Miles Davis";
        let album = "Kind of Blue";
        let query_str = format!("release:{album} AND artist:{artist}");
        let encoded = urlencoding::encode(&query_str);
        let url = format!(
            "https://musicbrainz.org/ws/2/release/?query={encoded}&fmt=json&limit=1"
        );
        assert!(url.contains("release%3AKind%20of%20Blue"));
        assert!(url.contains("artist%3AMiles%20Davis"));
    }

    #[test]
    fn test_get_tracklist_parse() {
        let data: serde_json::Value = serde_json::from_str(
            r#"{
                "media": [
                    {
                        "tracks": [
                            {"title": "So What"},
                            {"title": "Freddie Freeloader"},
                            {"title": "Blue in Green"}
                        ]
                    }
                ]
            }"#,
        )
        .unwrap();
        let tracks = parse_tracklist(&data);
        assert_eq!(tracks.len(), 3);
        assert_eq!(tracks[0], "So What");
        assert_eq!(tracks[2], "Blue in Green");
    }
}
