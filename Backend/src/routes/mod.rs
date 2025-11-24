use actix_web::web;

mod handlers;

pub fn init_routes(cfg: &mut web::ServiceConfig) {
    cfg
        .service(handlers::search_tmdb_handler)
        .service(handlers::search_fr)
        .service(handlers::search_en)
        .service(handlers::download);
}