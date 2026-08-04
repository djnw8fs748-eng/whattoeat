# A tiny web server (nginx) with our one HTML file baked in.
# "alpine" just means it's built on a minimal Linux base, so the
# resulting image is small (a few MB, not hundreds).
FROM nginx:alpine

# Copy our recipe page in as the default page nginx serves.
COPY index.html /usr/share/nginx/html/index.html

# nginx listens on port 80 inside the container by default.
EXPOSE 80
