FROM postgres:16-alpine

COPY init-db.sql /docker-entrypoint-initdb.d/01-init.sql

EXPOSE 5432
