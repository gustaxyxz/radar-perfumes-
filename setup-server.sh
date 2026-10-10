#!/bin/bash
# ========================================================
# INSTALAÇÃO AUTOMATIZADA NO UBUNTU (ORACLE CLOUD FREE TIER)
# ========================================================

set -e
export DEBIAN_FRONTEND=noninteractive

echo "🧠 [0/5] Configurando 2GB de memória Swap (garantia de estabilidade)..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✅ Memória Swap ativada!"
fi

echo "🚀 [1/5] Atualizando sistema Ubuntu..."
sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

echo "📦 [2/5] Instalando Chromium e bibliotecas do Puppeteer..."
sudo apt install -y curl wget git unzip chromium-browser chromium libgbm-dev \
    ca-certificates fonts-liberation libatk-bridge2.0-0 \
    libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 \
    libfontconfig1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
    libpango-1.0-0 libpangocairo-1.0-0 libx11-6 libx11-xcb1 \
    libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release xdg-utils || true

echo "🟢 [3/5] Instalando Node.js LTS..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

echo "⚡ [4/5] Instalando gerenciador de processos PM2..."
sudo npm install -g pm2

echo "📂 [5/5] Instalando dependências do radar..."
npm install

echo ""
echo "========================================================"
echo "✅ SERVIDOR PRONTO COM SUCESSO!"
echo "Para ligar o radar e deixar rodando 24/7 sem cair:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "Para ver os logs do radar rodando:"
echo "   pm2 logs radar-perfumes"
echo "========================================================"
