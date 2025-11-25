use reqwest::Client;
use scraper::{Html, Selector, ElementRef};
use std::collections::HashSet;
use url::Url;
use crate::models::ResultItem;

// Fonction générique (Adaptée pour YggTorrent / Clones avec vérification stricte)
pub async fn perform_scraping(query: &str, domain: &str) -> Vec<ResultItem> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .unwrap_or_else(|_| Client::new());

    let mut results = Vec::new();
    let mut seen_links = HashSet::new();

    // 0. NETTOYAGE INTELLIGENT DE LA REQUÊTE
    // On veut isoler le TITRE pur (ex: "Anna") des mots clés techniques (1080p, 2019...)
    let stop_words = ["1080p", "720p", "4k", "hdlight", "bluray", "webrip", "hdcam", "dvdrip", "truefrench", "french", "vostfr", "multi"];

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

        // Est-ce un mot clé technique ?
        if stop_words.iter().any(|&sw| p_lower.contains(sw)) {
            continue;
        }

        clean_parts.push(part);
    }

    let search_title = clean_parts.join(" ");

    println!("🔍 Analyse stricte: Titre='{}', Année='{:?}' (Query originale: '{}')", search_title, search_year, query);

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

    // Sélecteur tableau de résultats (Table > Tbody > Tr)
    let tr_selector = Selector::parse("table tbody tr").unwrap();
    let link_selector = Selector::parse("a").unwrap();
    let base_url = Url::parse(domain).unwrap();

    for tr in document.select(&tr_selector) {
        for link in tr.select(&link_selector) {
            if let Some(href) = link.value().attr("href") {
                // MODIFICATION: On accepte /torrent/ ET /detail/ (format Ygg)
                if !href.contains("/torrent/") && !href.contains("/detail/") { continue; }

                // On essaie d'abord l'attribut 'title' (souvent plus complet), sinon le texte du lien
                let mut title = link.value().attr("title").unwrap_or("").to_string();
                if title.is_empty() {
                    title = link.text().collect::<Vec<_>>().join(" ").trim().to_string();
                }

                if title.is_empty() { continue; }

                // --- VÉRIFICATION STRICTE (Anti-Annabelle) ---

                // Fonction locale pour nettoyer les chaines
                // MODIFICATION 1 : Remplace la ponctuation par des ESPACES
                // MODIFICATION 2 : Retire les mots clés (stop_words)
                // MODIFICATION 3 : Retire les CHIFFRES
                let clean_string = |s: &str| -> String {
                    s.chars()
                        // Garde alphanumérique et espaces
                        .map(|c| if c.is_alphanumeric() || c.is_whitespace() { c } else { ' ' })
                        .collect::<String>()
                        .to_lowercase()
                        .split_whitespace()
                        .filter(|&w| !stop_words.contains(&w))
                        .collect::<Vec<&str>>()
                        .join(" ")
                        // Retire maintenant les chiffres qui restent (ex: "Toy Story 4" -> "Toy Story")
                        .chars()
                        .map(|c| if c.is_numeric() { ' ' } else { c })
                        .collect::<String>()
                        .split_whitespace()
                        .collect::<Vec<&str>>()
                        .join(" ")
                };

                let title_clean = clean_string(&title);
                let search_title_clean = clean_string(&search_title);

                // A. Vérification de l'année (si fournie dans la requête)
                if let Some(year) = search_year {
                    // Important: On vérifie sur le titre brut (lowercase) car title_clean n'a plus de chiffres
                    if !title.to_lowercase().contains(year) {
                        // println!("❌ Rejeté (Mauvaise année) : {}", title);
                        continue;
                    }
                }

                // B. Vérification du Titre Exact (mot entier)
                // Le titre doit commencer par "Anna"
                if title_clean.starts_with(&search_title_clean) {
                    // Vérifie le caractère juste après le titre trouvé
                    // Si c'est une lettre ou un chiffre, c'est que c'est un autre mot (ex: Anna -> Annabelle)
                    let char_after = title_clean.chars().nth(search_title_clean.len());

                    if let Some(c) = char_after {
                        if c.is_alphanumeric() {
                            println!("⚠️ Faux positif rejeté (Nom partiel) : {}", title);
                            continue;
                        }
                    }
                } else {
                    // Si le titre ne commence même pas par le mot clé, on rejette
                    continue;
                }

                // ---------------------------------------------

                let full_url = if href.starts_with("http") {
                    href.to_string()
                } else {
                    base_url.join(href).unwrap().to_string()
                };

                if seen_links.insert(full_url.clone()) {
                    println!("✅ Résultat validé : {}", title);
                    println!("📄 Page détail trouvée : {}", full_url);

                    // 2. RECUPERATION MAGNET SUR LA PAGE DÉTAIL
                    if let Ok(detail_res) = client.get(&full_url).send().await {
                        if let Ok(detail_body) = detail_res.text().await {
                            let detail_doc = Html::parse_document(&detail_body);

                            // Ciblage Magnet spécifique pour YggTorrent (classe .bott ou lien magnet générique)
                            let magnet_selector = Selector::parse("a.bott[href^='magnet:'], a[href^='magnet:']").unwrap();

                            if let Some(magnet_link) = detail_doc.select(&magnet_selector).next() {
                                if let Some(magnet_href) = magnet_link.value().attr("href") {
                                    results.push(ResultItem {
                                        title: title.clone(),
                                        href: magnet_href.to_string()
                                    });
                                    println!("🧲 Magnet trouvé !");
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

// Fonction Spéciale PirateBay / Magnet (Inchangée)
pub async fn piratebay_scraping(query: &str, domain: &str) -> Vec<ResultItem> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .unwrap_or_else(|_| Client::new());

    let mut results = Vec::new();

    let url_str = format!("{}/search/{} 1080p/1/99/0", domain, query);
    println!("Scraping TPB: {}", url_str);

    let res = match client.get(&url_str).send().await {
        Ok(r) => r,
        Err(_) => return results,
    };

    let body = match res.text().await {
        Ok(b) => b,
        Err(_) => return results,
    };

    let document = Html::parse_document(&body);

    let tr_selector = Selector::parse("tr").unwrap();
    let magnet_selector = Selector::parse("a[href^='magnet:']").unwrap();
    let title_selector = Selector::parse(".detName a, a.detLink").unwrap();

    for tr in document.select(&tr_selector) {
        let magnet_href = match tr.select(&magnet_selector).next() {
            Some(el) => el.value().attr("href").unwrap_or("").to_string(),
            None => continue,
        };

        let title = match tr.select(&title_selector).next() {
            Some(el) => el.text().collect::<Vec<_>>().join(" ").trim().to_string(),
            None => "Titre inconnu".to_string(),
        };

        if !magnet_href.is_empty() {
            results.push(ResultItem {
                title,
                href: magnet_href,
            });
            break;
        }
    }

    results
}