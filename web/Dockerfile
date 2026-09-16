FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG CONTACT_EMAIL
RUN test -n "$CONTACT_EMAIL" || \
      (echo "CONTACT_EMAIL build-arg is required (set the PRIVACY_CONTACT_EMAIL repo variable)" >&2; exit 1)
RUN sed -i "s/set-PRIVACY_CONTACT_EMAIL@example\.invalid/${CONTACT_EMAIL}/" src/environments/environment.ts

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist/web/browser/ /usr/share/nginx/html/

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
