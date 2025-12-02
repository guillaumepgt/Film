use actix_web::{web, HttpRequest, HttpResponse};
use reqwest::Client;

pub async fn get_meta(path: web::Path<String>) -> HttpResponse {
    let id = path.into_inner();
    let url = format!("http://streamer-{}:9000/meta", id);

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_else(|_| Client::new());

    match client.get(&url).send().await {
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            HttpResponse::build(status)
                .content_type("application/json")
                .body(body)
        },
        Err(_) => HttpResponse::ServiceUnavailable().json("Streamer en démarrage...")
    }
}

pub async fn stream_video(req: HttpRequest, path: web::Path<String>) -> HttpResponse {
    let id = path.into_inner();
    let url = format!("http://streamer-{}:9000/", id);

    let client = Client::new();
    let mut builder = client.get(&url);

    if let Some(range) = req.headers().get("Range") {
        builder = builder.header("Range", range);
    }
    if let Some(query) = req.uri().query() {
        builder = builder.query(&[("start", query.split('=').nth(1).unwrap_or("0"))]);
    }

    match builder.send().await {
        Ok(resp) => {
            let status = resp.status();
            let mut response = HttpResponse::build(status);

            if let Some(ct) = resp.headers().get("Content-Type") { response.insert_header(("Content-Type", ct.clone())); }
            if let Some(cl) = resp.headers().get("Content-Length") { response.insert_header(("Content-Length", cl.clone())); }
            if let Some(cr) = resp.headers().get("Content-Range") { response.insert_header(("Content-Range", cr.clone())); }
            response.insert_header(("Accept-Ranges", "bytes"));

            response.streaming(resp.bytes_stream())
        },
        Err(_) => HttpResponse::ServiceUnavailable().body("Conteneur vidéo introuvable")
    }
}