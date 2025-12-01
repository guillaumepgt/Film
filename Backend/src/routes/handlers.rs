use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use crate::config::Settings;
use crate::models::{SearchParams, MagnetParams};
use crate::services::{tmdb, scraper, docker, stream};

// --- Route TMDB ---
#[get("/search_tmdb")]
pub async fn search_tmdb_handler(
    params: web::Query<SearchParams>,
    config: web::Data<Settings>,
) -> impl Responder {
    let api_key = &config.keys.tmdb_api_key;
    match tmdb::search_movie(api_key, &params.query).await {
        Ok(results) => HttpResponse::Ok().json(results),
        Err(err_msg) => HttpResponse::InternalServerError().body(err_msg),
    }
}

// --- Routes Scraping ---
#[get("/search_fr")]
pub async fn search_fr(params: web::Query<SearchParams>, config: web::Data<Settings>) -> impl Responder {
    let results = scraper::perform_scraping(&params.query, "https://ww1-yggtorrent.me").await;
    if let Some(first_result) = results.first() {
        docker::spawn_download_container(first_result.href.clone(), config.docker.image_name.clone());
    }
    HttpResponse::Ok().json(results)
}

#[get("/search_en")]
pub async fn search_en(params: web::Query<SearchParams>, config: web::Data<Settings>) -> impl Responder {
    let results = scraper::piratebay_scraping(&params.query, "https://thepibay.online").await;
    if let Some(first_result) = results.first() {
        docker::spawn_download_container(first_result.href.clone(), config.docker.image_name.clone());
    }
    HttpResponse::Ok().json(results)
}

#[post("/download")]
pub async fn download(magnet: web::Json<MagnetParams>, config: web::Data<Settings>) -> impl Responder {
    docker::spawn_download_container(magnet.magnet.clone(), config.docker.image_name.clone());
    HttpResponse::Ok().body("OK")
}

// --- NOUVELLES ROUTES STREAMING (PROXY) ---

#[get("/stream/meta")]
pub async fn stream_meta() -> impl Responder {
    // Appelle le service proxy
    stream::get_meta().await
}

#[get("/stream/video")]
pub async fn stream_video_handler(req: HttpRequest) -> impl Responder {
    // Appelle le service proxy avec la requête (pour les headers Range)
    stream::stream_video(req).await
}