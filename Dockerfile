FROM node:12-alpine3.12

RUN \
  wget -O /tmp/s6-overlay-aarch64-installer \
    https://github.com/just-containers/s6-overlay/releases/download/v2.1.0.2/s6-overlay-aarch64-installer && \
  chmod +x /tmp/s6-overlay-aarch64-installer && /tmp/s6-overlay-aarch64-installer /

COPY package*.json *.js /tc66c-mqtt/

WORKDIR /tc66c-mqtt

RUN apk add --no-cache --virtual .gyp python3 make g++ && \
    npm install && \
    apk del .gyp

ENTRYPOINT ["/init"]
