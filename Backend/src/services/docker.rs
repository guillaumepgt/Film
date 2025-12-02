use bollard::Docker;
use bollard::container::{Config as ContainerConfig, CreateContainerOptions};
use bollard::models::{HostConfig};
use tokio::spawn;

pub fn spawn_download_container(magnet_link: String, image_name: String, id:String) {
    spawn(async move {
        let container_name = format!("streamer-{}", id);
        println!("➡️  [Multi-Stream] Lancement session : {}", container_name);

        let docker = match Docker::connect_with_unix_defaults() {
            Ok(d) => d,
            Err(e) => {
                println!("❌ Erreur connexion Docker Socket: {}", e);
                return;
            }
        };

        let config = ContainerConfig::<String> {
            image: Some(image_name),
            env: Some(vec![
                format!("MAGNET={}", magnet_link),
            ]),
            host_config: Some(HostConfig {
                binds: Some(vec![
                    "/home/guy/IdeaProjects/Film/rclone:/home/media/.config/rclone".to_string(),
                ]),
                network_mode: Some("film_default".to_string()),
                auto_remove: Some(true),
                ..Default::default()
            }),
            ..Default::default()
        };

        match docker.create_container(Some(CreateContainerOptions {
            name: container_name.clone(),
            platform: None,
        }), config).await {
            Ok(container) => {
                if let Err(e) = docker.start_container::<String>(&container.id, None).await {
                    println!("❌ Erreur démarrage {}: {}", container_name, e);
                } else {
                    println!("🚀 {} est en ligne sur le réseau interne !", container_name);
                }
            }
            Err(e) => println!("❌ Erreur création {}: {}", container_name, e),
        }
    });
}