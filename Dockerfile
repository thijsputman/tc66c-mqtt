FROM node:12-alpine3.12 AS npm-ci

SHELL ["/bin/ash", "-euo", "pipefail", "-c"]

WORKDIR /tc66c-mqtt

COPY package*.json *.js LICENSE ./

RUN apk add --no-cache python3~=3.8 make~=4.3 g++~=9.3 && \
    npm ci --production

FROM node:12-alpine3.12

SHELL ["/bin/ash", "-euo", "pipefail", "-c"]

RUN apk add --no-cache --virtual /tmp/.gpg gnupg~=2.2 && \
    # Set correct architecture for s6-overlay
    case $(arch) in \
      aarch64) arch=aarch64 ;; \
      armv7l)  arch=armhf ;; \
      x86_64)  arch=amd64 ;; \
      *) echo "Invalid architecture '$(arch)'" && exit 1 ;; \
    esac && \
    # Download just-containers s6-overlay installer and its signature
    wget -nv -O /tmp/s6-installer \
      "https://github.com/just-containers/s6-overlay/releases/download/v2.1.0.2/s6-overlay-$arch-installer" && \
    wget -nv -O /tmp/s6-installer.sig \
      "https://github.com/just-containers/s6-overlay/releases/download/v2.1.0.2/s6-overlay-$arch-installer.sig" && \
    # Import just-containers' public key; use gpgv to validate installer
    wget -nv -O - https://keybase.io/justcontainers/pgp_keys.asc?fingerprint=db301ba3f6f807e0d0e6ccb86101b2783b2fd161 | \
      gpg --no-default-keyring --keyring /tmp/s6-installer.gpg --import && \
    gpgv --keyring /tmp/s6-installer.gpg /tmp/s6-installer.sig /tmp/s6-installer && \
    # Execute the installer
    chmod +x /tmp/s6-installer && /tmp/s6-installer / && \
    # Cleanup
    rm /tmp/s6-installer* && \
    apk del /tmp/.gpg

COPY docker/rootfs/ /

WORKDIR /tc66c-mqtt

COPY --from=npm-ci /tc66c-mqtt .

# Restore SHELL to its default
SHELL ["/bin/sh", "-c"]

ENTRYPOINT ["/init"]
