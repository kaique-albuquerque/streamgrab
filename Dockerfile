FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY scripts ./scripts
RUN FFMPEG_SKIP_DOWNLOAD=1 npm ci --omit=dev

COPY . .

RUN mkdir -p /downloads

ENV STREAMGRAB_DOWNLOAD_DIR=/downloads

ENTRYPOINT ["node", "bin/streamgrab.mjs"]
