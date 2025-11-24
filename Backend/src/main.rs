use actix_web::{web, App, HttpServer};
use dotenv::dotenv;
use std::io;

mod config;
mod models;
mod routes;
mod services;

use crate::config::Settings;

#[tokio::main]
async fn main() -> io::Result<()> {
    dotenv().ok();
    let config = Settings::new().expect("❌ Erreur lors du chargement de la config");

    println!("🚀 Démarrage sur {}:{}", config.server.host, config.server.port);
    let app_config = web::Data::new(config.clone());

    HttpServer::new(move || {
        App::new()
            .app_data(app_config.clone())
            .configure(routes::init_routes)
    })
        .bind((config.server.host.as_str(), config.server.port))?
        .run()
        .await
}