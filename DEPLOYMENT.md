# Deployment Guide

## Recommended Free Hosting

- Frontend: Vercel
- Backend: Render (Web Service)
- Database: MongoDB Atlas (M0 free)

## Deployment Order (Important)

1. Deploy backend first
2. Deploy frontend second

Reason: frontend needs the live backend URL in `VITE_API_URL`.

## Step 1: Prepare MongoDB Atlas

1. Go to https://cloud.mongodb.com
2. Create a free M0 cluster
3. Create database user
4. Add IP access (0.0.0.0/0 for quick start)
5. Copy connection string for `MONGODB_URI`

## Step 2: Deploy Backend on Render (First)

1. Push repo to GitHub
2. Render -> New -> Web Service
3. Select repo
4. Root directory: `server`
5. Build command: `npm install`
6. Start command: `npm start`
7. Add environment variables:

  - `NODE_ENV=production`
  - `PORT=10000` (Render will provide this automatically too)
  - `MONGODB_URI=<your atlas connection string>`
  - `JWT_SECRET=<long random>`
  - `JWT_REFRESH_SECRET=<long random>`
  - `JWT_EXPIRE=15m`
  - `JWT_REFRESH_EXPIRE=7d`
  - `CLIENT_URL=https://your-frontend.vercel.app`
  - `CLIENT_URLS=https://your-frontend.vercel.app,http://localhost:5173`
  - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`
  - `GEMINI_API_KEY` (optional)

8. Deploy and copy backend base URL, for example:
  `https://your-backend.onrender.com`
9. Verify health endpoint:
  `https://your-backend.onrender.com/api/health`

## Step 3: Deploy Frontend on Vercel (Second)

1. Vercel -> Add New -> Project
2. Import same repository
3. Set root directory to `client`
4. Framework preset: `Vite`
5. Add env var:
  `VITE_API_URL=https://your-backend.onrender.com/api`
6. Build command: `npm run build`
7. Output directory: `dist`
8. Deploy

## Step 4: Final Backend Env Update

After Vercel gives final domain:

1. Update Render env:
  - `CLIENT_URL=https://your-final-vercel-domain.vercel.app`
  - `CLIENT_URLS=https://your-final-vercel-domain.vercel.app,http://localhost:5173`
2. Trigger redeploy on Render

## File Upload Note (Free Tier)

This project currently stores files under `server/uploads`.
On free cloud runtimes, local disk is ephemeral, so uploaded files may be lost after restarts.

For durable production storage, move uploads to an object store such as Cloudinary, S3-compatible storage, or Supabase Storage.

## Option 2: Docker (Self-hosted)

```dockerfile
# server/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 5000
CMD ["node", "index.js"]
```

```yaml
# docker-compose.yml
version: '3'
services:
  mongodb:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
  server:
    build: ./server
    ports:
      - "5000:5000"
    env_file: ./server/.env
    depends_on:
      - mongodb
  client:
    build: ./client
    ports:
      - "80:80"
volumes:
  mongo_data:
```
