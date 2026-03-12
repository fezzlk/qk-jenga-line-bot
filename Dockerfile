# === このDockerfileはテンプレートです ===
# プロジェクトのスタックに合わせて編集してください
#
# 例: Next.js
#   FROM node:20-alpine AS builder
#   WORKDIR /app
#   COPY package*.json ./
#   RUN npm ci
#   COPY . .
#   RUN npm run build
#   FROM node:20-alpine
#   WORKDIR /app
#   COPY --from=builder /app/.next/standalone ./
#   EXPOSE 8080
#   ENV PORT=8080
#   CMD ["node", "server.js"]
#
# 例: FastAPI
#   FROM python:3.12-slim
#   WORKDIR /app
#   COPY requirements.txt .
#   RUN pip install --no-cache-dir -r requirements.txt
#   COPY . .
#   EXPOSE 8080
#   CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
#
# 例: Flask
#   FROM python:3.12-slim
#   WORKDIR /app
#   COPY requirements.txt .
#   RUN pip install --no-cache-dir -r requirements.txt
#   COPY . .
#   EXPOSE 8080
#   CMD ["gunicorn", "--bind", "0.0.0.0:8080", "app:app"]

FROM node:20-alpine
WORKDIR /app
COPY . .
RUN echo "TODO: ビルドコマンドをここに記載"
EXPOSE 8080
CMD ["echo", "TODO: 起動コマンドをここに記載"]
