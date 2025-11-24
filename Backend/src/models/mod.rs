use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct SearchParams {
    pub query: String,
}

#[derive(Deserialize)]
pub struct MagnetParams {
    pub magnet: String,
}

#[derive(Serialize)]
pub struct ResultItem {
    pub title: String,
    pub href: String,
}

// --- TMDB API Structures ---

#[derive(Debug, Deserialize, Serialize)]
pub struct TmdbResponse {
    pub results: Vec<TmdbResult>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TmdbResult {
    pub id: i32,
    pub title: Option<String>,
    pub name: Option<String>,
    pub media_type: Option<String>,
    pub release_date: Option<String>,
    pub first_air_date: Option<String>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
}