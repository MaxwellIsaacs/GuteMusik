//! Merge MusicBrainz and Wikipedia data to classify releases.

use std::collections::HashMap;

use super::types::{ClassifiedAlbum, MbAlbum, ReleaseCategory};

/// Classify an MusicBrainz album using its own type fields.
fn mb_category(album: &MbAlbum) -> ReleaseCategory {
    let secondary: Vec<&str> = album.secondary_types.iter().map(|s| s.as_str()).collect();

    // Check secondary types first (more specific).
    if secondary.contains(&"Compilation") {
        return ReleaseCategory::Compilation;
    }
    if secondary.contains(&"Live") {
        return ReleaseCategory::Live;
    }
    if secondary.contains(&"Soundtrack") {
        return ReleaseCategory::Soundtrack;
    }
    if secondary.contains(&"Remix") || secondary.contains(&"DJ-mix") {
        return ReleaseCategory::Remix;
    }
    if secondary.contains(&"Mixtape/Street") {
        return ReleaseCategory::Mixtape;
    }
    if secondary.contains(&"Demo") {
        return ReleaseCategory::Demo;
    }
    if secondary.contains(&"Interview") || secondary.contains(&"Spokenword") {
        return ReleaseCategory::Other;
    }

    // Fall back to primary type.
    match album.release_type.as_str() {
        "Album" => ReleaseCategory::StudioAlbum,
        "EP" => ReleaseCategory::Ep,
        "Single" => ReleaseCategory::Single,
        _ => ReleaseCategory::Other,
    }
}

/// Map a Wikipedia category keyword to a `ReleaseCategory`.
fn wiki_category_to_release(wiki_cat: &str) -> ReleaseCategory {
    match wiki_cat {
        "studio_album" => ReleaseCategory::StudioAlbum,
        "ep" => ReleaseCategory::Ep,
        "live" => ReleaseCategory::Live,
        "compilation" => ReleaseCategory::Compilation,
        "mixtape" => ReleaseCategory::Mixtape,
        "single" => ReleaseCategory::Single,
        "soundtrack" => ReleaseCategory::Soundtrack,
        "demo" => ReleaseCategory::Demo,
        "remix" => ReleaseCategory::Remix,
        _ => ReleaseCategory::Other,
    }
}

/// Try to match an album title against the Wikipedia lookup map.
///
/// Uses exact lowercase match first, then a fuzzy prefix/substring match.
fn wiki_lookup(title: &str, wiki_map: &HashMap<String, String>) -> Option<ReleaseCategory> {
    let lower = title.to_lowercase();

    // Exact match.
    if let Some(cat) = wiki_map.get(&lower) {
        return Some(wiki_category_to_release(cat));
    }

    // Substring match – Wikipedia titles sometimes include extra
    // qualifiers like "(album)" or "(Radiohead album)".
    for (wiki_title, cat) in wiki_map {
        // MB title contained in Wiki title or vice versa
        if wiki_title.contains(&lower) || lower.contains(wiki_title.as_str()) {
            return Some(wiki_category_to_release(cat));
        }
    }

    None
}

/// Merge MusicBrainz albums with Wikipedia data to produce classified
/// albums with confidence scores.
pub fn classify(
    mb_albums: &[MbAlbum],
    wiki_map: &HashMap<String, String>,
) -> Vec<ClassifiedAlbum> {
    let has_wiki = !wiki_map.is_empty();

    mb_albums
        .iter()
        .map(|album| {
            let mb_cat = mb_category(album);
            let wiki_cat = if has_wiki {
                wiki_lookup(&album.title, wiki_map)
            } else {
                None
            };

            let (category, confidence, sources) = match wiki_cat {
                Some(ref wc) if *wc == mb_cat => {
                    // Both sources agree – high confidence.
                    (mb_cat, 0.95, vec!["musicbrainz".into(), "wikipedia".into()])
                }
                Some(wc) => {
                    // Sources disagree.  Prefer MusicBrainz (structured data)
                    // but lower confidence.
                    //
                    // Exception: if MB says StudioAlbum but Wiki says
                    // something more specific, prefer Wiki.
                    let chosen = if mb_cat == ReleaseCategory::StudioAlbum
                        && matches!(
                            wc,
                            ReleaseCategory::Live
                                | ReleaseCategory::Compilation
                                | ReleaseCategory::Soundtrack
                                | ReleaseCategory::Mixtape
                        )
                    {
                        wc
                    } else {
                        mb_cat
                    };
                    (chosen, 0.6, vec!["musicbrainz".into(), "wikipedia".into()])
                }
                None if has_wiki => {
                    // Not found on Wikipedia – slightly lower confidence.
                    (mb_cat, 0.7, vec!["musicbrainz".into()])
                }
                None => {
                    // No Wikipedia data at all.
                    (mb_cat, 0.75, vec!["musicbrainz".into()])
                }
            };

            ClassifiedAlbum {
                id: album.id.clone(),
                title: album.title.clone(),
                year: album.year.clone(),
                release_type: album.release_type.clone(),
                secondary_types: album.secondary_types.clone(),
                category,
                confidence,
                sources,
            }
        })
        .collect()
}
