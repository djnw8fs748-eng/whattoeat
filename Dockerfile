# A tiny web server (nginx) with our page and its recipe data
# baked in. "alpine" just means it's built on a minimal Linux
# base, so the resulting image is small (a few MB, not hundreds).
FROM nginx:alpine

# Copy in the page and the recipe data it loads at runtime.
COPY index.html /usr/share/nginx/html/index.html
COPY recipes.json /usr/share/nginx/html/recipes.json

# nginx listens on port 80 inside the container by default.
EXPOSE 80
