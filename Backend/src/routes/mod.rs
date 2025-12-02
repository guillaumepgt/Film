use actix_web::web;

mod handlers;

pub fn init_routes(cfg: &mut web::ServiceConfig) {
    cfg
        .service(handlers::search_tmdb_handler)
        .service(handlers::search_fr)
        .service(handlers::search_en)
        .service(handlers::download)
        .service(web::resource("/stream/{id}/meta").route(web::get().to(handlers::stream_meta)))
        .service(web::resource("/stream/{id}/video").route(web::get().to(handlers::stream_video_handler)));
}