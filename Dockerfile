FROM arm64v8/node:12-alpine3.12

RUN \
  apk add --no-cache --virtual /tmp/.gpg gnupg && \
  # Download just-containers s6-overlay installer and its signature
  wget -O /tmp/s6-installer \
    https://github.com/just-containers/s6-overlay/releases/download/v2.1.0.2/s6-overlay-aarch64-installer && \
  wget -O /tmp/s6-installer.sig \
    https://github.com/just-containers/s6-overlay/releases/download/v2.1.0.2/s6-overlay-aarch64-installer.sig && \
  # Import just-containers' public key; use gpgv to validate installer
  wget -O - https://keybase.io/justcontainers/pgp_keys.asc?fingerprint=db301ba3f6f807e0d0e6ccb86101b2783b2fd161 | \
    gpg --no-default-keyring --keyring /tmp/s6-installer.gpg --import && \
  gpgv --keyring /tmp/s6-installer.gpg /tmp/s6-installer.sig /tmp/s6-installer && \
  # Execute the installer
  chmod +x /tmp/s6-installer && /tmp/s6-installer / && \
  # Cleanup
  rm /tmp/s6-installer* && \
  apk del /tmp/.gpg

COPY package*.json *.js LICENSE /tc66c-mqtt/

WORKDIR /tc66c-mqtt

RUN apk add --no-cache --virtual .gyp python3 make g++ && \
    npm ci --production && \
    apk del .gyp

COPY docker/rootfs/ /

ENTRYPOINT ["/init"]
