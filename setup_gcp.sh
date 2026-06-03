#!/bin/bash
# GCP Setup Script for Line Poker

echo "======================================"
echo "🚀 準備安裝撲克遊戲伺服器環境..."
echo "======================================"

# 更新系統並安裝 Node.js (使用 Node 20.x)
echo "📦 安裝 Node.js 與 Git..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 安裝 PM2 (用於背景常駐執行與開機自動啟動)
echo "📦 安裝 PM2 進程管理器..."
sudo npm install -g pm2

# 抓取最新的遊戲程式碼
echo "📥 下載遊戲原始碼..."
if [ -d "line-poker" ]; then
    echo "資料夾已存在，進行更新..."
    cd line-poker
    git checkout master
    git pull origin master
else
    git clone https://github.com/wecanho-afk/line-poker.git
    cd line-poker
    git checkout master
fi

# 安裝套件
echo "📦 安裝遊戲相依套件..."
npm install

# 啟動伺服器
echo "🚀 啟動遊戲伺服器..."
pm2 stop line-poker || true
pm2 start app.js --name line-poker

# 設定開機自動啟動
echo "⚙️ 設定開機自動重啟..."
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME || true

echo "======================================"
echo "✅ 部署完成！伺服器已在背景運行。"
echo "你現在可以直接關閉這個黑畫面視窗了。"
echo "======================================"
