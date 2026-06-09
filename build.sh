#!/bin/bash

echo "🧹 A limpar dist antigo..."
cd backend || exit
rm -rf dist

echo "📦 A fazer build do frontend..."
cd ../frontend || exit
npm run build

echo "📁 A copiar dist para o backend..."
cp -r dist ../backend

cd .. || exit
echo "✅ Build concluído!"
