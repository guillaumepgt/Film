use actix_web::{get, post, web, HttpResponse, Responder};
use crate::config::Settings;
use crate::models::{SearchParams, MagnetParams};
use crate::services::{tmdb, scraper, docker};

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

#[get("/search_fr")]
pub async fn search_fr(
    params: web::Query<SearchParams>,
    config: web::Data<Settings>,
) -> impl Responder {
    let results = scraper::perform_scraping(&params.query, "https://ww1-oxtorrent.me").await;
    if let Some(first_result) = results.first() {
        docker::spawn_download_container(
            first_result.href.clone(),
            config.docker.image_name.clone()
        );
    }
    HttpResponse::Ok().json(results)
}


#[get("/search_en")]
pub async fn search_en(
    params: web::Query<SearchParams>,
    config: web::Data<Settings>,
) -> impl Responder {
    let results = scraper::piratebay_scraping(&params.query, "https://thepibay.online").await;
    if let Some(first_result) = results.first() {
        docker::spawn_download_container(
            first_result.href.clone(),
            config.docker.image_name.clone()
        );
    }
    HttpResponse::Ok().json(results)
}

#[post("/download")]
pub async fn download(
    magnet: web::Json<MagnetParams>,
    config: web::Data<Settings>
) -> impl Responder {
    docker::spawn_download_container(
        magnet.magnet.clone(),
        config.docker.image_name.clone()
    );

    HttpResponse::Ok().body("Téléchargement démarré en arrière-plan. Stream sur port 9000.")
}