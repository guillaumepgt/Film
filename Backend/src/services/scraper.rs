use reqwest::Client;
use scraper::{Html, Selector};
use std::collections::HashSet;
use url::Url;
use crate::models::ResultItem;

pub async fn perform_scraping(query: &str, domain: &str) -> Vec<ResultItem> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .unwrap_or_else(|_| Client::new());

    let mut results = Vec::new();
    let mut seen_links = HashSet::new();

    // 0. NETTOYAGE INTELLIGENT DE LA REQUÊTE
    // AJOUT DES CODECS ICI pour qu'ils soient ignorés lors de la vérification du titre
    let stop_words = [
        "1080p", "720p", "4k", "hdlight", "bluray", "webrip", "hdcam", "dvdrip",
        "truefrench", "french", "vostfr", "multi",
        "x264", "h264", "x265", "h265", "hevc", "aac", "ac3", "dts" // <--- Nouveaux mots clés
    ];

    let parts: Vec<&str> = query.split_whitespace().collect();
    let mut clean_parts = Vec::new();
    let mut search_year = None;

    for part in parts {
        let p_lower = part.to_lowercase();

        if part.len() == 4 && part.chars().all(char::is_numeric) {
            search_year = Some(part);
            continue;
        }

        if stop_words.iter().any(|&sw| p_lower.contains(sw)) {
            continue;
        }

        clean_parts.push(part);
    }

    let search_title = clean_parts.join(" ");

    println!("🔍 Analyse stricte: Titre='{}', Année='{:?}' (Query: '{}')", search_title, search_year, query);

    // 1. RECHERCHE
    let url_str = format!("{}/recherche/{}", domain, query);
    println!("🔍 Scraping URL: {}", url_str);

    let res = match client.get(&url_str).send().await {
        Ok(r) => r,
        Err(_) => return results,
    };

    let body = match res.text().await {
        Ok(b) => b,
        Err(_) => return results,
    };

    let document = Html::parse_document(&body);
    let tr_selector = Selector::parse("table tbody tr").unwrap();
    let link_selector = Selector::parse("a").unwrap();
    let base_url = Url::parse(domain).unwrap();

    for tr in document.select(&tr_selector) {
        for link in tr.select(&link_selector) {
            if let Some(href) = link.value().attr("href") {
                if !href.contains("/torrent/") && !href.contains("/detail/") { continue; }

                let mut title = link.value().attr("title").unwrap_or("").to_string();
                if title.is_empty() {
                    title = link.text().collect::<Vec<_>>().join(" ").trim().to_string();
                }

                if title.is_empty() { continue; }

                // --- VÉRIFICATION STRICTE ---
                let clean_string = |s: &str| -> String {
                    s.chars()
                        .map(|c| if c.is_alphanumeric() || c.is_whitespace() { c } else { ' ' })
                        .collect::<String>()
                        .to_lowercase()
                        .split_whitespace()
                        .filter(|&w| !stop_words.contains(&w))
                        .collect::<Vec<&str>>()
                        .join(" ")
                };

                let title_clean = clean_string(&title);
                let search_title_clean = clean_string(&search_title);

                if let Some(year) = search_year {
                    if !title.to_lowercase().contains(year) { continue; }
                }

                if title_clean.starts_with(&search_title_clean) {
                    let char_after = title_clean.chars().nth(search_title_clean.len());
                    if let Some(c) = char_after {
                        if c.is_alphanumeric() { continue; }
                    }
                } else {
                    continue;
                }

                let full_url = if href.starts_with("http") {
                    href.to_string()
                } else {
                    base_url.join(href).unwrap().to_string()
                };

                if seen_links.insert(full_url.clone()) {
                    if let Ok(detail_res) = client.get(&full_url).send().await {
                        if let Ok(detail_body) = detail_res.text().await {
                            let detail_doc = Html::parse_document(&detail_body);
                            let magnet_selector = Selector::parse("a.bott[href^='magnet:'], a[href^='magnet:']").unwrap();

                            if let Some(magnet_link) = detail_doc.select(&magnet_selector).next() {
                                if let Some(magnet_href) = magnet_link.value().attr("href") {
                                    results.push(ResultItem {
                                        title: title.clone(),
                                        href: magnet_href.to_string()
                                    });
                                    return results;
                                }
                            }
                        }
                    }
                }
                break;
            }
        }
    }
    results
}

// Fonction Spéciale PirateBay
pub async fn piratebay_scraping(query: &str, domain: &str) -> Vec<ResultItem> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .unwrap_or_else(|_| Client::new());

    let mut results = Vec::new();

    // 0. NETTOYAGE (Copie de la logique pour TPB)
    let stop_words = [
        "1080p", "720p", "4k", "hdlight", "bluray", "webrip", "hdcam", "dvdrip",
        "truefrench", "french", "vostfr", "multi",
        "x264", "h264", "x265", "h265", "hevc", "aac", "ac3", "dts"
    ];

    let parts: Vec<&str> = query.split_whitespace().collect();
    let mut clean_parts = Vec::new();
    let mut search_year = None;

    for part in parts {
        let p_lower = part.to_lowercase();
        // Est-ce une année ?
        if part.len() == 4 && part.chars().all(char::is_numeric) {
            search_year = Some(part);
            continue;
        }
        if stop_words.iter().any(|&sw| p_lower.contains(sw)) {
            continue;
        }
        clean_parts.push(part);
    }

    let search_title = clean_parts.join(" ");
    println!("🔍 [TPB] Analyse stricte: Titre='{}', Année='{:?}'", search_title, search_year);

    // 1. RECHERCHE SUR TPB
    // On ajoute "1080p" dans la recherche URL pour filtrer, mais on garde la logique stricte ensuite
    let url_str = format!("{}/search/{}/1/99/0", domain, query);
    println!("🔍 Scraping TPB: {}", url_str);

    let res = match client.get(&url_str).send().await {
        Ok(r) => r,
        Err(_) => return results,
    };

    let body = match res.text().await {
        Ok(b) => b,
        Err(_) => return results,
    };

    let document = Html::parse_document(&body);

    // Sélecteurs spécifiques à PirateBay
    // #searchResult tr : les lignes du tableau
    let tr_selector = Selector::parse("#searchResult tr").unwrap();
    let magnet_selector = Selector::parse("a[href^='magnet:']").unwrap();
    let title_selector = Selector::parse(".detName a").unwrap();

    for tr in document.select(&tr_selector) {
        // Extraction Magnet
        let magnet_href = match tr.select(&magnet_selector).next() {
            Some(el) => el.value().attr("href").unwrap_or("").to_string(),
            None => continue,
        };

        // Extraction Titre
        let title = match tr.select(&title_selector).next() {
            Some(el) => el.text().collect::<Vec<_>>().join(" ").trim().to_string(),
            None => continue,
        };

        // --- VÉRIFICATION STRICTE (Code dupliqué pour l'instant) ---
        let clean_string = |s: &str| -> String {
            s.chars()
                .map(|c| if c.is_alphanumeric() || c.is_whitespace() { c } else { ' ' })
                .collect::<String>()
                .to_lowercase()
                .split_whitespace()
                .filter(|&w| !stop_words.contains(&w))
                .collect::<Vec<&str>>()
                .join(" ")
        };

        let title_clean = clean_string(&title);
        let search_title_clean = clean_string(&search_title);

        // A. Vérification de l'année
        if let Some(year) = search_year {
            if !title.to_lowercase().contains(year) { continue; }
        }

        // B. Vérification du Titre Exact
        if title_clean.starts_with(&search_title_clean) {
            let char_after = title_clean.chars().nth(search_title_clean.len());
            if let Some(c) = char_after {
                if c.is_alphanumeric() {
                    // println!("⚠️ Rejeté : {}", title);
                    continue;
                }
            }
        } else {
            continue;
        }

        if !magnet_href.is_empty() {
            println!("✅ [TPB] Résultat validé : {}", title);
            results.push(ResultItem {
                title,
                href: magnet_href,
            });
            break; // On s'arrête au premier résultat valide
        }
    }

    results
}