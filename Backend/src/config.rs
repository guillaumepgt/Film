use serde::Deserialize;
use config::{Config, ConfigError, File};

#[derive(Debug, Deserialize, Clone)]
pub struct Settings {
    pub server: ServerConfig,
    pub keys: KeysConfig,
    pub docker: DockerConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Deserialize, Clone)]
pub struct KeysConfig {
    pub tmdb_api_key: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DockerConfig {
    pub image_name: String,
}

impl Settings {
    pub fn new() -> Result<Self, ConfigError> {
        let builder = Config::builder()
            .add_source(File::with_name(".env").required(false))
            .add_source(config::Environment::default().separator("__"));

        builder.build()?.try_deserialize()
    }
}