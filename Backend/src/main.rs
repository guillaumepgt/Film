use actix_web::{get, post, web, App, HttpServer, HttpResponse, Responder};
use reqwest::Client;
use scraper::{Html, Selector, ElementRef};
use serde::{Deserialize, Serialize};
use url::Url;
use std::collections::{HashSet, HashMap};
use bollard::Docker;
use bollard::container::{Config as ContainerConfig, CreateContainerOptions};
use bollard::models::{HostConfig, PortBinding};
use tokio::spawn;

#[derive(Deserialize)]
struct SearchParams {
    query: String,
}

#[derive(Serialize)]
struct ResultItem {
    title: String,
    href: String,
}

#[derive(Deserialize)]
struct MagnetParams {
    magnet: String,
}

struct AppState {
    tmdb_api_key: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct TmdbResponse {
    results: Vec<TmdbResult>,
}

#[derive(Debug, Deserialize, Serialize)]
struct TmdbResult {
    id: i32,
    title: Option<String>,
    name: Option<String>,
    media_type: Option<String>, // Option car parfois absent
    release_date: Option<String>,
    first_air_date: Option<String>,
    overview: Option<String>,
    poster_path: Option<String>,   // L'affiche verticale
    backdrop_path: Option<String>,
}

// --- 3. HANDLERS (FONCTIONS) ---

// Recherche officielle via API TMDB (pour avoir les bons titres)
#[get("/search_tmdb")]
async fn search_tmdb_handler(
    params: web::Query<SearchParams>,
    data: web::Data<AppState>,
) -> impl Responder {
    // MODIFICATION ICI : On utilise le builder pour définir le User-Agent
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (compatible; MyMovieApp/1.0)")
        .build()
        .unwrap_or_else(|_| Client::new()); // Fallback sur le client par défaut si échec

    let api_key = &data.tmdb_api_key;
    let query = &params.query;

    // Encodage du query pour éviter les erreurs avec les espaces/accents
    let encoded_query = urlencoding::encode(query);

    let url = format!(
        "https://api.themoviedb.org/3/search/multi?api_key={}&query={}&language=fr-FR&include_adult=false",
        api_key, encoded_query
    );
    println!("url: {}", url);

    match client.get(&url).send().await {
        Ok(resp) => match resp.json::<TmdbResponse>().await {
            Ok(tmdb_data) => {
                let processed_results: Vec<TmdbResult> = tmdb_data.results.into_iter().map(|mut item| {
                    let base_image_url = "https://image.tmdb.org/t/p/w500";

                    if let Some(path) = item.poster_path {
                        item.poster_path = Some(format!("{}{}", base_image_url, path));
                    }

                    if let Some(path) = item.backdrop_path {
                        item.backdrop_path = Some(format!("{}{}", base_image_url, path));
                    }

                    item
                }).collect();

                HttpResponse::Ok().json(processed_results)
            },
            Err(e) => {
                println!("Erreur parsing TMDB: {:?}", e);
                HttpResponse::InternalServerError().body("Erreur de décodage TMDB")
            },
        },
        Err(e) => {
            println!("Erreur network TMDB: {:?}", e);
            HttpResponse::InternalServerError().body("Erreur de connexion à TMDB")
        },
    }
}

// Scraping Torrent (Source 1)
#[get("/search_fr")]
async fn search_fr(params: web::Query<SearchParams>) -> HttpResponse {
    perform_scraping(&params.query, "https://ww1-oxtorrent.me").await
}

// Scraping Torrent (Source 2)
#[get("/search_en")]
async fn search_en(params: web::Query<SearchParams>) -> HttpResponse {
    perform_scraping(&params.query, "https://www.oxtorrent.town").await
}

// Fonction générique pour éviter de copier-coller le code de scraping
async fn perform_scraping(query: &str, domain: &str) -> HttpResponse {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .unwrap();

    let mut results = Vec::new();
    let mut seen_links = HashSet::new();
    let mut page = 1;
    let max_pages = 2; // Limite pour éviter le timeout

    loop {
        if page > max_pages { break; }

        let url_str = if page == 1 {
            format!("{}/recherche/{}", domain, query)
        } else {
            format!("{}/recherche/{}/{}", domain, query, page)
        };

        // Si la requête échoue, on arrête la boucle
        let res = match client.get(&url_str).send().await {
            Ok(r) => r,
            Err(_) => break,
        };

        let body = match res.text().await {
            Ok(b) => b,
            Err(_) => break,
        };

        let document = Html::parse_document(&body);
        // Sélecteurs ajustés
        let films_icon = Selector::parse("td > i.Films, td > i.Séries").unwrap(); // On prend Films et Séries
        let link_selector = Selector::parse("a").unwrap();
        let base_url = Url::parse(domain).unwrap();

        let mut page_results = 0;

        for icon in document.select(&films_icon) {
            // Remonter au TR parent
            if let Some(tr) = icon.parent().and_then(|p| p.parent()).and_then(ElementRef::wrap) {
                if tr.value().name() == "tr" {
                    // Chercher le lien dans ce TR
                    for link in tr.select(&link_selector) {
                        if let Some(href) = link.value().attr("href") {
                            // Nettoyage du titre
                            let title = link.text().collect::<Vec<_>>().join(" ").trim().to_string();

                            // Reconstitution de l'URL absolue
                            let full_url = if href.starts_with("http") {
                                href.to_string()
                            } else {
                                base_url.join(href).unwrap().to_string()
                            };

                            if seen_links.insert(full_url.clone()) {
                                results.push(ResultItem {
                                    title,
                                    href: full_url,
                                });
                                page_results += 1;
                            }
                            break; // On a trouvé le lien principal de la ligne, on passe à la suivante
                        }
                    }
                }
            }
        }

        if page_results == 0 {
            break; // Plus de résultats, on arrête
        }

        page += 1; // IMPORTANT: Incrémentation de page (+1, pas +50)
    }

    HttpResponse::Ok().json(results)
}

// Lancement du téléchargement Docker
#[post("/download")]
async fn download(magnet: web::Json<MagnetParams>) -> HttpResponse {
    let magnet_link = magnet.magnet.clone();

    // On lance la tâche en arrière-plan pour ne pas bloquer l'API
    spawn(async move {
        println!("➡️  Lancement Docker pour : {}", magnet_link);

        // Connexion au socket Docker local
        let docker = match Docker::connect_with_unix_defaults() {
            Ok(d) => d,
            Err(e) => {
                println!("❌ Erreur connexion Docker Socket: {}", e);
                return;
            }
        };

        // Configuration des ports (9000 interne -> 9000 externe)
        let mut exposed_ports = HashMap::new();
        exposed_ports.insert("9000/tcp".to_string(), HashMap::new());

        let mut port_bindings = HashMap::new();
        port_bindings.insert(
            "9000/tcp".to_string(),
            Some(vec![PortBinding {
                host_ip: Some("0.0.0.0".to_string()),
                host_port: Some("9000".to_string()),
            }]),
        );

        // Config du conteneur
        let config = ContainerConfig::<String> {
            image: Some("film-downloads".to_string()), // Assure-toi que cette image existe
            env: Some(vec![
                format!("MAGNET={}", magnet_link),
            ]),
            exposed_ports: Some(exposed_ports),
            host_config: Some(HostConfig {
                binds: Some(vec![
                    // Montage de la config Rclone
                    "/home/guy/IdeaProjects/Film/rclone:/home/media/.config/rclone".to_string(),
                    // Montage du socket Docker (si ton script bash doit gérer d'autres conteneurs, sinon optionnel ici)
                    // "/var/run/docker.sock:/var/run/docker.sock".to_string()
                ]),
                port_bindings: Some(port_bindings),
                auto_remove: Some(true), // Le conteneur se supprime tout seul à la fin
                ..Default::default()
            }),
            ..Default::default()
        };

        let container_name = "film_dl_streamer";

        // Nettoyage de l'ancien conteneur si existant
        let _ = docker.remove_container(container_name, Some(bollard::container::RemoveContainerOptions {
            force: true,
            ..Default::default()
        })).await;

        match docker.create_container(Some(CreateContainerOptions {
            name: container_name.to_string(),
            platform: None,
        }), config).await {
            Ok(container) => {
                if let Err(e) = docker.start_container::<String>(&container.id, None).await {
                    println!("❌ Erreur démarrage conteneur: {}", e);
                } else {
                    println!("🚀 Conteneur démarré ! Stream sur http://localhost:9000");
                }
            }
            Err(e) => println!("❌ Erreur création conteneur: {}", e),
        }
    });

    HttpResponse::Ok().body("Téléchargement démarré. Stream disponible sur http://localhost:9000")
}

// --- 4. MAIN ---

#[tokio::main]
async fn main() -> std::io::Result<()> {
    // Clé API stockée ici (Idéalement, utilise std::env::var("TMDB_KEY"))
    let api_key = "54ea147af6c586f7a571e70ba4b8b6f3".to_string();

    // Création de l'état partagé
    let app_state = web::Data::new(AppState {
        tmdb_api_key: api_key.clone(),
    });

    println!("🚀 API Actix lancée sur http://0.0.0.0:8080");

    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone()) // Injection de la clé API
            .service(search_tmdb_handler)
            .service(search_fr)
            .service(search_en)
            .service(download)
    })
        .bind(("0.0.0.0", 8080))?
        .run()
        .await
}