use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use crate::config::Settings;
use crate::models::{SearchParams, MagnetParams};
use crate::services::{tmdb, scraper, docker, stream};
use std::time::{SystemTime, UNIX_EPOCH};

#[get("/search_tmdb")]
pub async fn search_tmdb_handler(params: web::Query<SearchParams>, config: web::Data<Settings>) -> impl Responder {
    let api_key = &config.keys.tmdb_api_key;
    match tmdb::search_movie(api_key, &params.query).await {
        Ok(results) => HttpResponse::Ok().json(results),
        Err(err_msg) => HttpResponse::InternalServerError().body(err_msg),
    }
}

#[get("/search_fr")]
pub async fn search_fr(params: web::Query<SearchParams>) -> impl Responder {
    let results = scraper::perform_scraping(&params.query, "https://ww1-yggtorrent.me").await;
    HttpResponse::Ok().json(results)
}

#[get("/search_en")]
pub async fn search_en(params: web::Query<SearchParams>) -> impl Responder {
    let results = scraper::piratebay_scraping(&params.query, "https://thepibay.online").await;
    HttpResponse::Ok().json(results)
}

#[post("/download")]
pub async fn download(
    magnet: web::Json<MagnetParams>,
    config: web::Data<Settings>
) -> impl Responder {
    let session_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
        .to_string();

    println!("📺 [INFO] Nouvelle session de streaming créée : {}", session_id);
    println!("👉 Lien pour VLC : http://localhost/api/stream/{}/video", session_id);

    docker::spawn_download_container(
        magnet.magnet.clone(),
        config.docker.image_name.clone(),
        session_id.clone()
    );

    HttpResponse::Ok().json(serde_json::json!({ "stream_id": session_id }))
}

pub async fn stream_meta(path: web::Path<String>) -> impl Responder {
    stream::get_meta(path).await
}

pub async fn stream_video_handler(req: HttpRequest, path: web::Path<String>) -> impl Responder {
    stream::stream_video(req, path).await
}