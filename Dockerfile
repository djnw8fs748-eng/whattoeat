# Stage 1 — build the React app into plain static files (dist/).
# recipes.json, recipes/_index.json and the favicons are copied into
# dist/ by the build (see vite.config.ts).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 — serve those files with a tiny nginx web server. Only the
# finished site is copied across; Node and the source code are left behind.
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
