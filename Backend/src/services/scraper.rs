use reqwest::Client;
use scraper::{Html, Selector, ElementRef};
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

    // 1. RECHERCHE
    let url_str = format!("{}/recherche/{}", domain, query);

    let res = match client.get(&url_str).send().await {
        Ok(r) => r,
        Err(_) => return results,
    };

    let body = match res.text().await {
        Ok(b) => b,
        Err(_) => return results,
    };

    let document = Html::parse_document(&body);
    let films_icon = Selector::parse("td > i.Films, td > i.Séries, i.Films, i.Séries").unwrap();
    let link_selector = Selector::parse("a").unwrap();
    let base_url = Url::parse(domain).unwrap();

    for icon in document.select(&films_icon) {
        if let Some(tr) = icon.parent().and_then(|p| p.parent()).and_then(ElementRef::wrap) {
            if tr.value().name() == "tr" {
                for link in tr.select(&link_selector) {
                    if let Some(href) = link.value().attr("href") {
                        let title = link.text().collect::<Vec<_>>().join(" ").trim().to_string();

                        // Construction de l'URL de la page de détail
                        let full_url = if href.starts_with("http") {
                            href.to_string()
                        } else {
                            base_url.join(href).unwrap().to_string()
                        };

                        if seen_links.insert(full_url.clone()) {
                            // 2. NAVIGATION VERS LA PAGE DE DÉTAIL
                            println!("📄 Page détail trouvée, récupération du magnet : {}", full_url);

                            // On fait une requête immédiate sur la page de détail
                            if let Ok(detail_res) = client.get(&full_url).send().await {
                                if let Ok(detail_body) = detail_res.text().await {
                                    let detail_doc = Html::parse_document(&detail_body);

                                    // Sélecteur pour trouver le lien commençant par "magnet:"
                                    let magnet_selector = Selector::parse("a[href^='magnet:']").unwrap();

                                    if let Some(magnet_link) = detail_doc.select(&magnet_selector).next() {
                                        if let Some(magnet_href) = magnet_link.value().attr("href") {
                                            // On remplace l'URL de la page par le lien MAGNET
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
                    }
                }
            }
        }
    }

    results
}

pub async fn piratebay_scraping(query: &str, domain: &str) -> Vec<ResultItem> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .unwrap_or_else(|_| Client::new());

    let mut results = Vec::new();

    let url_str = format!("{}/search/{}+1080p/1/99/0", domain, query);
    println!("Scraping TPB (Single Result): {}", url_str);

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