#!/bin/bash

# Script de instalación inicial para EC2
# Ejecutar como: sudo bash setup.sh

echo "🚀 Iniciando configuración del servidor..."

# Actualizar sistema
apt-get update
apt-get upgrade -y

# Instalar Python 3 y pip
apt-get install -y python3 python3-pip git nginx

# Instalar PM2 globalmente a través de npm (Node.js sigue siendo útil para PM2)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs
npm install -g pm2

# Crear directorio para la aplicación
mkdir -p /opt/location-tracker
cd /opt/location-tracker

# Clonar el repositorio
echo "📦 Clonando repositorio..."
read -p "Ingresa la URL del repositorio de GitHub: " REPO_URL
git clone $REPO_URL .

# --- Configurar Backend (Python) ---
echo "⚙️ Configurando Backend en Python..."
cd backend

# Instalar dependencias de Python
pip3 install -r requirements.txt

# Crear archivo .env para backend
echo "Configurando variables de entorno del backend..."
read -p "DB_HOST (RDS endpoint): " DB_HOST
read -p "DB_NAME: " DB_NAME
read -p "DB_USER: " DB_USER
read -sp "DB_PASSWORD: " DB_PASSWORD
echo

cat > .env <<EOL
DB_HOST=$DB_HOST
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
HTTP_PORT=2000
UDP_PORT=5001
EOL

# Iniciar backend con PM2 usando el puerto 2000
pm2 start "uvicorn main:app --host 0.0.0.0 --port 2000" --name location-backend --interpreter python3
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu

# --- Configurar Frontend (Sin cambios en lógica) ---
echo "⚙️ Configurando Frontend..."
cd ../frontend
npm install

# Obtener IP pública de la instancia
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com)

# Crear .env para el frontend apuntando al puerto 2000
cat > .env <<EOL
VITE_API_URL=http://$PUBLIC_IP:2000
VITE_POLLING_INTERVAL=5000
EOL

# Construir frontend
npm run build

# --- Configurar Nginx ---
echo "🌐 Configurando Nginx..."
cat > /etc/nginx/sites-available/location-tracker <<'EOL'
server {
    listen 80;
    server_name _;

    root /opt/location-tracker/frontend/dist;
    index index.html;

    # Frontend
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Proxy para API apuntando al puerto 2000
    location /api {
        proxy_pass http://localhost:2000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOL

# Habilitar el sitio y reiniciar Nginx
ln -sf /etc/nginx/sites-available/location-tracker /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# --- Configurar Firewall ---
echo "🔒 Configurando firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 2000/tcp # Nuevo puerto para la API
ufw allow 5001/udp # Nuevo puerto para UDP
ufw --force enable

echo "✅ ¡Instalación completada!"
echo ""
echo "📝 Notas importantes:"
echo "1. El backend de Python corre en PM2 (API en puerto 2000, UDP en 5001)"
echo "2. El frontend está servido por Nginx en el puerto 80"
echo "3. Para ver logs del backend: pm2 logs location-backend"
echo "4. IP pública de tu servidor: $PUBLIC_IP"
echo ""
echo "🔑 Configuración de seguridad AWS:"
echo "Asegúrate de abrir estos puertos en el Security Group de tu EC2:"
echo "- 22 (SSH)"
echo "- 80 (HTTP)"
echo "- 2000 (API Backend)"
echo "- 5001 (UDP)"