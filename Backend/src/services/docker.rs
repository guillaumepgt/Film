use bollard::Docker;
use bollard::container::{Config as ContainerConfig, CreateContainerOptions, RemoveContainerOptions};
use bollard::models::{HostConfig, PortBinding};
use std::collections::HashMap;
use tokio::spawn;

pub fn spawn_download_container(magnet_link: String, image_name: String) {
    spawn(async move {
        println!("➡️  [Service] Lancement Docker pour : {}", magnet_link);

        let docker = match Docker::connect_with_unix_defaults() {
            Ok(d) => d,
            Err(e) => {
                println!("❌ Erreur connexion Docker Socket: {}", e);
                return;
            }
        };

        // Note: On n'a plus besoin d'exposer le port 9000 sur l'hôte (0.0.0.0)
        // car le backend va communiquer en interne via le réseau Docker.
        // Mais on le laisse pour le debug si besoin.
        let mut exposed_ports = HashMap::new();
        exposed_ports.insert("9000/tcp".to_string(), HashMap::new());

        let config = ContainerConfig::<String> {
            image: Some(image_name),
            env: Some(vec![
                format!("MAGNET={}", magnet_link),
            ]),
            exposed_ports: Some(exposed_ports),
            host_config: Some(HostConfig {
                binds: Some(vec![
                    "/home/guy/IdeaProjects/Film/rclone:/home/media/.config/rclone".to_string(),
                ]),
                // IMPORTANT : Connexion au réseau du projet pour que Rust puisse voir ce conteneur
                // Remplacez 'film_default' par le nom réel de votre réseau (voir `docker network ls`)
                // Si vous lancez via docker-compose dans un dossier 'film', c'est souvent 'film_default'
                network_mode: Some("film_default".to_string()),
                auto_remove: Some(true),
                ..Default::default()
            }),
            ..Default::default()
        };

        let container_name = "film_dl_streamer";

        // Nettoyage silencieux
        let _ = docker.remove_container(container_name, Some(RemoveContainerOptions {
            force: true,
            ..Default::default()
        })).await;

        match docker.create_container(Some(CreateContainerOptions {
            name: container_name.to_string(),
            platform: None,
        }), config).await {
            Ok(container) => {
                if let Err(e) = docker.start_container::<String>(&container.id, None).await {
                    println!("❌ Erreur démarrage: {}", e);
                } else {
                    println!("🚀 Streamer lancé ! Accessible via l'API Rust.");
                }
            }
            Err(e) => println!("❌ Erreur création: {}", e),
        }
    });
}