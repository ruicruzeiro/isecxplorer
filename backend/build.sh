#!/bin/bash

echo "🧹 A limpar dist antigo..."
rm -rf dist

echo "📦 A fazer build do frontend..."
cd ../frontend || exit
npm run build

echo "📁 A copiar dist para o backend..."
cp -r dist ../backend

echo "🔙 A voltar para o backend..."
cd ../backend || exit

echo "✅ Build concluído!"
