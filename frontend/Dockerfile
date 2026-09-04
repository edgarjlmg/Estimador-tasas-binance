# Etapa 1: Build de los activos web estáticos con Node.js
FROM node:20-alpine AS builder
WORKDIR /app

# Copiar definiciones de dependencias
COPY package*.json ./
RUN npm install

# Copiar el código fuente
COPY . .

# Exportar la aplicación web estática optimizada (genera la carpeta dist/)
RUN npx expo export --platform web

# Etapa 2: Servir con Nginx ultraligero
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Limpiar archivos por defecto de Nginx
RUN rm -rf ./*

# Copiar el build estático generado
COPY --from=builder /app/dist .

# Exponer el puerto web estándar
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
