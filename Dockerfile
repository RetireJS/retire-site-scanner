FROM --platform=linux/amd64 node:latest

RUN apt update && apt install -y chromium

WORKDIR /app

COPY --chown=1000:1000 *.json /app/
RUN chown 1000 /app
USER 1000
RUN npm install
COPY --chown=1000:1000 src/* /app/src/

ENTRYPOINT [ "npm", "run", "start", "--", "--docker" ]
