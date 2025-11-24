FROM alpine:latest

# 1. Installation des dépendances
# - nodejs & npm : Pour installer et lancer Peerflix
# - rclone : Pour l'upload Drive
# - bash, procps : Pour le script et la gestion des processus (kill)
# - ca-certificates : Pour que rclone/npm puissent vérifier les certificats HTTPS
RUN apk add --no-cache \
    nodejs \
    npm \
    rclone \
    bash \
    ca-certificates \
    procps

# 2. Installation de Peerflix via NPM (Global)
RUN npm install -g peerflix

# 3. Création de l'utilisateur (Sécurité)
RUN adduser -D -u 1000 media

# 4. Configuration des dossiers
RUN mkdir -p /downloads && chown -R media:media /downloads && touch /var/log/peerflix.log && chown media:media /var/log/peerflix.log

WORKDIR /downloads

# 5. Copie et permission du script
COPY sync.sh /sync.sh
RUN chmod +x /sync.sh

# 6. Lancement en tant qu'utilisateur standard
USER media

ENTRYPOINT ["/sync.sh"]