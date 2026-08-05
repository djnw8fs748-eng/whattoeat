# A tiny web server (nginx) with our page and its recipe data
# baked in. "alpine" just means it's built on a minimal Linux
# base, so the resulting image is small (a few MB, not hundreds).
FROM nginx:alpine

# Copy in the page and the recipe data it loads at runtime.
COPY index.html /usr/share/nginx/html/index.html
COPY recipes.json /usr/share/nginx/html/recipes.json

# Favicon assets. favicon-16.png, favicon-32.png, apple-touch-icon.png,
# and favicon.ico are generated from favicon.svg during the GitHub
# Actions build (see the workflow) — they won't exist if you're building
# this image locally without running that step first.
COPY favicon.svg /usr/share/nginx/html/favicon.svg
COPY favicon-16.png /usr/share/nginx/html/favicon-16.png
COPY favicon-32.png /usr/share/nginx/html/favicon-32.png
COPY apple-touch-icon.png /usr/share/nginx/html/apple-touch-icon.png
COPY favicon.ico /usr/share/nginx/html/favicon.ico

# nginx listens on port 80 inside the container by default.
EXPOSE 80
