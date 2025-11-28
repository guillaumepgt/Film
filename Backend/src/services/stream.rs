use actix_web::{HttpRequest, HttpResponse};
use reqwest::Client;
use futures_util::StreamExt; // Pour .bytes_stream()

// Nom d'hôte interne du conteneur Docker (défini dans docker.rs)
const STREAMER_URL: &str = "http://film_dl_streamer:9000";

// Proxy pour les métadonnées (Status, Nom du fichier)
pub async fn get_meta() -> HttpResponse {
    let client = Client::new();
    let url = format!("{}/meta", STREAMER_URL);

    match client.get(&url).send().await {
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            HttpResponse::build(status)
                .content_type("application/json")
                .body(body)
        },
        Err(_) => HttpResponse::ServiceUnavailable().json("Streamer non connecté")
    }
}

// Proxy pour le flux Vidéo (Le gros morceau)
pub async fn stream_video(req: HttpRequest) -> HttpResponse {
    let client = Client::new();
    let url = format!("{}/", STREAMER_URL);

    // 1. On récupère le header "Range" du navigateur (pour l'avance rapide)
    let mut builder = client.get(&url);
    if let Some(range) = req.headers().get("Range") {
        builder = builder.header("Range", range);
    }

    match builder.send().await {
        Ok(resp) => {
            let status = resp.status();
            let headers = resp.headers().clone();

            // 2. On crée une réponse Actix
            let mut response = HttpResponse::build(status);

            // 3. On copie les headers importants (Type, Taille, Range)
            // C'est crucial pour que le navigateur sache que c'est une vidéo
            if let Some(ct) = headers.get("Content-Type") {
                response.insert_header(("Content-Type", ct.clone()));
            }
            if let Some(cl) = headers.get("Content-Length") {
                response.insert_header(("Content-Length", cl.clone()));
            }
            if let Some(cr) = headers.get("Content-Range") {
                response.insert_header(("Content-Range", cr.clone()));
            }
            response.insert_header(("Accept-Ranges", "bytes"));

            // 4. On stream le corps de la réponse sans tout charger en RAM
            response.streaming(resp.bytes_stream())
        },
        Err(_) => HttpResponse::ServiceUnavailable().body("Erreur connexion Streamer")
    }
}