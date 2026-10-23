FROM nginx:1.27-alpine

RUN apk add --no-cache apache2-utils

COPY snippets/ /etc/nginx/snippets/
COPY templates/ /etc/nginx/templates/
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
    && mkdir -p /var/www/certbot \
    && rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]

RUN chmod +x /entrypoint.sh \
    && mkdir -p /var/www/certbot \
    && rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
