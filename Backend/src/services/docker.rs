use bollard::Docker;
use bollard::container::{Config as ContainerConfig, CreateContainerOptions};
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
                port_bindings: Some(port_bindings),
                auto_remove: Some(true),
                ..Default::default()
            }),
            ..Default::default()
        };

        let container_name = "film_dl_streamer";

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
}