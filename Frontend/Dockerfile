# Étape 1 : Build
FROM node:18-alpine as build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# Étape 2 : Serveur Web léger
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Configuration Nginx simple pour le SPA (Single Page App)
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; index index.html index.htm; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]