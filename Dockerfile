FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY recipes.json /usr/share/nginx/html/recipes.json
COPY favicon.svg /usr/share/nginx/html/favicon.svg
COPY favicon-16.png /usr/share/nginx/html/favicon-16.png
COPY favicon-32.png /usr/share/nginx/html/favicon-32.png
COPY apple-touch-icon.png /usr/share/nginx/html/apple-touch-icon.png
COPY favicon.ico /usr/share/nginx/html/favicon.ico
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
