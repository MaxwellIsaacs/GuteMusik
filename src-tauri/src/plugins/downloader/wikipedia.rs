//! Fetch and parse an artist's discography from Wikipedia.
//!
//! Used as a secondary source alongside MusicBrainz to increase
//! confidence in release classification.

use std::collections::HashMap;

const WP_USER_AGENT: &str = "GuteMusik/1.0 (https://github.com/gutemusik)";

/// An album extracted from a Wikipedia discography section.
#[derive(Debug, Clone)]
pub struct WikiAlbum {
    pub title: String,
    /// Normalised category keyword derived from the section heading.
    pub category: String,
}

/// Fetch the Wikipedia discography for an artist.
///
/// Tries `"{artist} discography"` first, then falls back to the main
/// artist page.  Returns an empty vec on any failure – Wikipedia data
/// is best-effort.
pub async fn get_discography(
    artist_name: &str,
    wikipedia_url: Option<&str>,
) -> Vec<WikiAlbum> {
    // Determine the page title to query.
    let page_title = if let Some(url) = wikipedia_url {
        // Extract title from a URL like https://en.wikipedia.org/wiki/Radiohead
        url.rsplit('/').next().unwrap_or(artist_name).to_string()
    } else {
        urlencoding::encode(artist_name).into_owned()
    };

    // Try the dedicated discography page first.
    let disco_title = format!("{page_title}_discography");
    if let Some(albums) = try_fetch_page(&disco_title).await {
        if !albums.is_empty() {
            return albums;
        }
    }

    // Fall back to the main artist page.
    if let Some(albums) = try_fetch_page(&page_title).await {
        return albums;
    }

    Vec::new()
}

async fn try_fetch_page(page_title: &str) -> Option<Vec<WikiAlbum>> {
    let url = format!(
        "https://en.wikipedia.org/w/api.php?action=parse&page={page_title}&prop=wikitext&format=json&redirects=1"
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", WP_USER_AGENT)
        .send()
        .await
        .ok()?;

    let body = resp.text().await.ok()?;
    let json: serde_json::Value = serde_json::from_str(&body).ok()?;

    // Check for error (page not found etc.)
    if json.get("error").is_some() {
        return None;
    }

    let wikitext = json["parse"]["wikitext"]["*"].as_str()?;
    Some(parse_wikitext(wikitext))
}

/// Parse wikitext into a list of albums grouped by section heading.
fn parse_wikitext(wikitext: &str) -> Vec<WikiAlbum> {
    let mut albums = Vec::new();
    let mut current_category = String::new();
    let mut in_discography = false;

    for line in wikitext.lines() {
        let trimmed = line.trim();

        // Detect section headers: == Title == or === Title ===
        if trimmed.starts_with('=') && trimmed.ends_with('=') {
            let level = trimmed.chars().take_while(|&c| c == '=').count();
            let heading = trimmed
                .trim_matches('=')
                .trim()
                .to_string();

            let heading_lower = heading.to_lowercase();

            // Track if we're inside a discography section (level 2)
            if level == 2 {
                in_discography = heading_lower.contains("discography")
                    || heading_lower.contains("album")
                    || heading_lower.contains("studio")
                    || heading_lower.contains("release");
            }

            // Classify section headings
            let cat = classify_section_heading(&heading_lower);
            if !cat.is_empty() {
                current_category = cat;
                in_discography = true; // sub-sections of discography
            } else if level <= 2 && !heading_lower.contains("discography") {
                // Left the discography area
                if in_discography && level == 2 {
                    in_discography = false;
                    current_category.clear();
                }
            }
            continue;
        }

        if current_category.is_empty() {
            continue;
        }

        // Extract album titles from list items and table rows.
        let titles = extract_titles_from_line(trimmed);
        for title in titles {
            if !title.is_empty() && title.len() > 1 {
                albums.push(WikiAlbum {
                    title,
                    category: current_category.clone(),
                });
            }
        }
    }

    albums
}

/// Map a section heading to a normalised category keyword.
fn classify_section_heading(heading: &str) -> String {
    // Order matters: check more specific patterns first.
    let patterns: &[(&[&str], &str)] = &[
        (&["studio album"], "studio_album"),
        (&["live album", "concert album"], "live"),
        (&["compilation album", "compilation"], "compilation"),
        (&["greatest hits"], "compilation"),
        (&["soundtrack"], "soundtrack"),
        (&["mixtape", "mix tape"], "mixtape"),
        (&["remix album", "remix"], "remix"),
        (&["demo album", "demo"], "demo"),
        (&["extended play", "eps", " ep"], "ep"),
        (&["single"], "single"),
        // Generic "albums" heading – likely studio albums when it's
        // the first/only albums section on a discography page.
        (&["album"], "studio_album"),
    ];

    for (keywords, category) in patterns {
        for kw in *keywords {
            if heading.contains(kw) {
                return category.to_string();
            }
        }
    }

    String::new()
}

/// Pull album titles out of a wikitext line.
///
/// Handles common patterns:
///   - `''[[Album Title]]''`  (italic-linked)
///   - `'''[[Album Title]]'''` (bold-linked)
///   - `[[Album Title|display]]`
///   - `* ''Album Title'' (2005)`
///   - Table rows: `| ''[[Album Title]]'' || ...`
fn extract_titles_from_line(line: &str) -> Vec<String> {
    let mut titles = Vec::new();

    // Skip lines that are clearly not album entries.
    if line.is_empty()
        || line.starts_with("{|")
        || line.starts_with("|}")
        || line.starts_with("|-")
        || line.starts_with("!")
        || line.starts_with("{{")
    {
        return titles;
    }

    // Strategy 1: Extract [[wikilinks]]
    let mut remaining = line;
    while let Some(start) = remaining.find("[[") {
        if let Some(end) = remaining[start..].find("]]") {
            let inner = &remaining[start + 2..start + end];
            // Take the part before any pipe (display text vs link target)
            let title = inner.split('|').next().unwrap_or(inner).trim();
            // Filter out non-album links (files, categories, etc.)
            if !title.starts_with("File:")
                && !title.starts_with("Image:")
                && !title.starts_with("Category:")
                && !title.contains("discography")
                && !title.contains("music of")
                && title.len() > 1
            {
                titles.push(clean_title(title));
            }
            remaining = &remaining[start + end + 2..];
        } else {
            break;
        }
    }

    // Strategy 2: If no wikilinks found, look for italic/bold titles
    // on list items (lines starting with * or |)
    if titles.is_empty() && (line.starts_with('*') || line.starts_with('|')) {
        let text = line.trim_start_matches(['*', '|', ' ']);
        // Match ''Title'' or '''Title'''
        let mut rest = text;
        while let Some(start) = rest.find("''") {
            let after_quotes = &rest[start..];
            // Count opening quotes
            let n_quotes = after_quotes.chars().take_while(|&c| c == '\'').count();
            let after = &after_quotes[n_quotes..];
            // Find closing quotes
            if let Some(end) = after.find(&"'".repeat(n_quotes)) {
                let title = &after[..end];
                if !title.is_empty() && title.len() > 1 && !title.contains('=') {
                    titles.push(clean_title(title));
                }
                rest = &after[end + n_quotes..];
            } else {
                break;
            }
        }
    }

    titles
}

fn clean_title(title: &str) -> String {
    title
        .trim()
        .trim_matches(|c: char| c == '\'' || c == '"' || c == '*')
        .trim()
        .to_string()
}

/// Build a lookup map: lowercase title → category.
pub fn build_lookup(albums: &[WikiAlbum]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for album in albums {
        map.insert(album.title.to_lowercase(), album.category.clone());
    }
    map
}
