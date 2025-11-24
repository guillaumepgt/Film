use reqwest::Client;
use crate::models::{TmdbResponse, TmdbResult};

pub async fn search_movie(api_key: &str, query: &str) -> Result<Vec<TmdbResult>, String> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (compatible; MyMovieApp/1.0)")
        .build()
        .map_err(|e| format!("Erreur création client: {}", e))?;

    let encoded_query = urlencoding::encode(query);
    let url = format!(
        "https://api.themoviedb.org/3/search/multi?api_key={}&query={}&language=fr-FR&include_adult=false",
        api_key, encoded_query
    );

    let resp = client.get(&url).send().await
        .map_err(|e| format!("Erreur réseau TMDB: {}", e))?;

    let tmdb_data = resp.json::<TmdbResponse>().await
        .map_err(|e| format!("Erreur parsing JSON TMDB: {}", e))?;

    let processed_results = tmdb_data.results.into_iter().map(|mut item| {
        let base_image_url = "https://image.tmdb.org/t/p/w500";

        if let Some(path) = item.poster_path {
            item.poster_path = Some(format!("{}{}", base_image_url, path));
        }
        if let Some(path) = item.backdrop_path {
            item.backdrop_path = Some(format!("{}{}", base_image_url, path));
        }
        item
    }).collect();

    Ok(processed_results)
}