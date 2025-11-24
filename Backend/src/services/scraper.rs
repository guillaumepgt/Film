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
    let mut page = 1;
    let max_pages = 2;

    loop {
        if page > max_pages { break; }

        let url_str = if page == 1 {
            format!("{}/recherche/{}", domain, query)
        } else {
            format!("{}/recherche/{}/{}", domain, query, page)
        };

        let res = match client.get(&url_str).send().await {
            Ok(r) => r,
            Err(_) => break,
        };

        let body = match res.text().await {
            Ok(b) => b,
            Err(_) => break,
        };

        let document = Html::parse_document(&body);
        let films_icon = Selector::parse("td > i.Films, td > i.Séries, i.Films, i.Séries").unwrap();
        let link_selector = Selector::parse("a").unwrap();
        let base_url = Url::parse(domain).unwrap();

        let mut page_results = 0;

        for icon in document.select(&films_icon) {
            if let Some(tr) = icon.parent().and_then(|p| p.parent()).and_then(ElementRef::wrap) {
                if tr.value().name() == "tr" {
                    for link in tr.select(&link_selector) {
                        if let Some(href) = link.value().attr("href") {
                            let title = link.text().collect::<Vec<_>>().join(" ").trim().to_string();

                            let full_url = if href.starts_with("http") {
                                href.to_string()
                            } else {
                                base_url.join(href).unwrap().to_string()
                            };

                            if seen_links.insert(full_url.clone()) {
                                results.push(ResultItem { title, href: full_url });
                                page_results += 1;
                            }
                            break;
                        }
                    }
                }
            }
        }

        if page_results == 0 { break; }
        page += 1;
    }

    results
}