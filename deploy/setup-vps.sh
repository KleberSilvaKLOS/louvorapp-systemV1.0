#!/usr/bin/env bash
# ============================================================================
# LOUVORAPP - SCRIPT AUTOMATIZADO DE PROVISIONAMENTO E IMPLANTAÇÃO EM VPS
# Compatível com Ubuntu 22.04 / 24.04 LTS e Debian 11 / 12
# Uso: sudo bash deploy/setup-vps.sh seu-dominio.suaigreja.org
# ============================================================================
set -euo pipefail

DOMAIN="${1:-louvor.suaigreja.org}"
APP_DIR="/var/www/louvorapp"

echo ">>> [1/6] Atualizando pacotes e instalando Node.js, Python3/SQLite3, Nginx e Certbot..."
apt-get update -y
apt-get install -y nodejs python3 sqlite3 nginx certbot python3-certbot-nginx rsync

echo ">>> [2/6] Sincronizando arquivos do projeto para ${APP_DIR}..."
mkdir -p "${APP_DIR}"
rsync -av --exclude='.git' --exclude='database/*.sqlite*' ./ "${APP_DIR}/"

if [ ! -f "${APP_DIR}/.env" ]; then
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  RANDOM_SECRET=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9')
  sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=${RANDOM_SECRET}|g" "${APP_DIR}/.env"
  sed -i "s|APP_URL=.*|APP_URL=https://${DOMAIN}|g" "${APP_DIR}/.env"
fi

echo ">>> [3/6] Inicializando banco de dados SQLite persistente..."
cd "${APP_DIR}"
node backend/server.js --migrate-only
chown -R www-data:www-data "${APP_DIR}"

echo ">>> [4/6] Configurando serviço systemd para inicialização automática..."
cp "${APP_DIR}/deploy/louvorapp.service" /etc/systemd/system/louvorapp.service
systemctl daemon-reload
systemctl enable louvorapp
systemctl restart louvorapp

echo ">>> [5/6] Configurando Nginx Reverse Proxy para ${DOMAIN}..."
sed "s|louvor.suaigreja.org|${DOMAIN}|g" "${APP_DIR}/deploy/nginx-louvorapp.conf" > /etc/nginx/sites-available/louvorapp
ln -sf /etc/nginx/sites-available/louvorapp /etc/nginx/sites-enabled/louvorapp
nginx -t
systemctl reload nginx

echo ">>> [6/6] Implantação concluída! Para ativar HTTPS (Let's Encrypt), execute:"
echo "    sudo certbot --nginx -d ${DOMAIN}"
