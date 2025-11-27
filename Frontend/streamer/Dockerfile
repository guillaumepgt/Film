FROM node:18-bullseye-slim

RUN apt-get update && \
    apt-get install -y --fix-missing --no-install-recommends ffmpeg python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installation des dépendances JS
COPY package.json .
RUN npm install

# Copie du code
COPY index.js .

# Port du stream
EXPOSE 9000

# Lancement
CMD ["node", "index.js"]