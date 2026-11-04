FROM docker:28-cli AS docker

FROM node:22-alpine
# Docker CLI with the compose and buildx plugins (talks to the host daemon through the socket).
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
WORKDIR /control
COPY server.mjs ./
EXPOSE 8080
CMD ["node", "server.mjs"]
