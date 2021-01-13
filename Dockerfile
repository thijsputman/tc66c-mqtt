FROM arm64v8/node:12-alpine3.12

RUN \
  apk add --no-cache --virtual /tmp/.gpg gnupg && \
  wget -O /tmp/s6-overlay-aarch64-installer \
    https://github.com/just-containers/s6-overlay/releases/download/v2.1.0.2/s6-overlay-aarch64-installer && \
  wget -O /tmp/s6-overlay-aarch64-installer.sig \
    https://github.com/just-containers/s6-overlay/releases/download/v2.1.0.2/s6-overlay-aarch64-installer.sig && \
  wget -O - https://keybase.io/justcontainers/key.asc | gpg --import && \
  gpg --verify /tmp/s6-overlay-aarch64-installer.sig /tmp/s6-overlay-aarch64-installer && \
  chmod +x /tmp/s6-overlay-aarch64-installer && /tmp/s6-overlay-aarch64-installer / && \
  rm /tmp/s6-overlay-aarch64-installer* && \
  apk del /tmp/.gpg

COPY package*.json *.js LICENSE /tc66c-mqtt/

WORKDIR /tc66c-mqtt

RUN apk add --no-cache --virtual .gyp python3 make g++ && \
    npm install && \
    apk del .gyp

COPY docker/rootfs/ /

ENTRYPOINT ["/init"]
