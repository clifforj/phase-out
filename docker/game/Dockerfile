# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM maven:3.9-eclipse-temurin-8 AS xmage

WORKDIR /src
COPY vendor/xmage/ ./

# Mage.Sets compiles tens of thousands of card classes.
ARG MAVEN_HEAP=3g
ENV MAVEN_OPTS="-Xmx${MAVEN_HEAP}"

RUN mvn -B -DskipTests -pl Mage.Server -am clean install

WORKDIR /src/Mage.Server
RUN mvn -B -DskipTests package assembly:single

RUN mkdir -p /dist && cd /dist && jar xf "$(ls /src/Mage.Server/target/*.zip | head -1)"

FROM --platform=$BUILDPLATFORM node:22-alpine AS decks

WORKDIR /src
COPY vendor/xmage/Mage.Sets/src/mage/sets/ ./vendor/xmage/Mage.Sets/src/mage/sets/
COPY tools/decks/build.mjs ./tools/decks/build.mjs
RUN node tools/decks/build.mjs

FROM xmage AS bridge

WORKDIR /bridge
COPY --chmod=755 bridge/gradlew ./gradlew
COPY bridge/gradle ./gradle
RUN ./gradlew --no-daemon --version > /dev/null

COPY bridge/settings.gradle.kts bridge/build.gradle.kts ./
RUN ./gradlew --no-daemon -q dependencies --configuration runtimeClasspath > /dev/null

COPY bridge/src ./src
RUN ./gradlew --no-daemon assemble

# The runtime copies its jars from this stage, so failed tests block the image.
FROM bridge AS test
COPY --from=decks /src/build/decks/ /build/decks/
COPY vendor/xmage/Mage.Tests/CommanderDuel.dck /vendor/xmage/Mage.Tests/CommanderDuel.dck
RUN ./gradlew --no-daemon test

FROM eclipse-temurin:8-jre AS runtime

WORKDIR /opt/xmage
COPY --from=xmage /dist/ /opt/xmage/

ARG XMAGE_SECONDARY_PORT=17179
RUN sed -i "s/secondaryBindPort=\"-1\"/secondaryBindPort=\"${XMAGE_SECONDARY_PORT}\"/" config/config.xml \
 && grep -q "secondaryBindPort=\"${XMAGE_SECONDARY_PORT}\"" config/config.xml

RUN mkdir -p db saved

COPY --from=test /bridge/build/libs/bridge.jar /opt/bridge/bridge.jar
COPY --from=test /bridge/build/libs/lib/ /opt/bridge/lib/

COPY --from=decks /src/build/decks/ /opt/bridge/decks/

COPY docker/game/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 17171 17179 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
