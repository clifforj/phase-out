#!/usr/bin/env bash
set -euo pipefail

XMAGE_HOME=${XMAGE_HOME:-/opt/xmage}
XMAGE_PORT=${XMAGE_PORT:-17171}
XMAGE_JAVA_OPTS=${XMAGE_JAVA_OPTS:--Xmx1536m}
BRIDGE_JAR=${BRIDGE_JAR:-/opt/bridge/bridge.jar}
BRIDGE_JAVA_OPTS=${BRIDGE_JAVA_OPTS:-}
XMAGE_STARTUP_TIMEOUT=${XMAGE_STARTUP_TIMEOUT:-600}

cd "$XMAGE_HOME"

server_jar=$(ls lib/mage-server-*.jar | head -1)
if [ -z "$server_jar" ]; then
    echo "entrypoint: no lib/mage-server-*.jar in $XMAGE_HOME" >&2
    exit 1
fi

if [ ! -f "$BRIDGE_JAR" ]; then
    echo "entrypoint: XMage server only ($server_jar), no bridge.jar present"
    exec java $XMAGE_JAVA_OPTS -jar "$server_jar"
fi

echo "entrypoint: XMage server + bridge"
java $XMAGE_JAVA_OPTS -jar "$server_jar" &
xmage_pid=$!

deadline=$((SECONDS + XMAGE_STARTUP_TIMEOUT))
until (exec 3<>"/dev/tcp/127.0.0.1/${XMAGE_PORT}") 2>/dev/null; do
    if ! kill -0 "$xmage_pid" 2>/dev/null; then
        echo "entrypoint: XMage server exited before opening port ${XMAGE_PORT}" >&2
        exit 1
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
        echo "entrypoint: XMage server did not open port ${XMAGE_PORT} within ${XMAGE_STARTUP_TIMEOUT}s" >&2
        exit 1
    fi
    sleep 1
done
exec 3>&- 2>/dev/null || true
echo "entrypoint: XMage server accepting connections on ${XMAGE_PORT}"

exec java $BRIDGE_JAVA_OPTS -jar "$BRIDGE_JAR"
