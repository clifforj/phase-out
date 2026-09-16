package online.commander.bridge

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.KotlinxWebsocketSerializationConverter
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.ktor.server.plugins.forwardedheaders.XForwardedHeaders
import io.ktor.server.plugins.origin
import io.ktor.server.request.contentType
import io.ktor.server.request.receive
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.pingPeriod
import io.ktor.server.websocket.timeout
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.channels.ClosedReceiveChannelException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import online.commander.bridge.auth.AccountGames
import online.commander.bridge.auth.AccountSessions
import online.commander.bridge.auth.AuthMode
import online.commander.bridge.auth.GoogleIdTokenVerifier
import online.commander.bridge.auth.IdentityService
import online.commander.bridge.auth.SessionTickets
import online.commander.bridge.identity.H2AccountStore
import org.slf4j.LoggerFactory
import java.time.Duration
import java.util.UUID
import kotlin.system.exitProcess

private val log = LoggerFactory.getLogger("bridge")

private const val MAX_FAILED_LOGINS = 5

private val UNAUTHENTICATED_IDLE: Duration = Duration.ofSeconds(120)

@OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
val json: Json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true

    explicitNulls = false
    prettyPrint = false
}

fun main() {

    System.setProperty("java.awt.headless", "true")

    val config = Config.fromEnv()

    config.authStartupError()?.let { problem ->
        log.error(problem)
        exitProcess(1)
    }
    log.info(
        "bridge v{} starting: ws://{}:{} -> xmage {}:{}",
        PROTOCOL_VERSION, config.bridgeHost, config.bridgePort, config.xmageHost, config.xmagePort,
    )
    log.info(
        "defaults: gameType='{}' (3+ seats: '{}'), deckType='{}', {} deck(s) in the pool: {}",
        config.defaultGameType, config.multiplayerGameType, config.defaultDeckType, config.decks.size,
        config.decks.joinToString().ifEmpty { "NONE FOUND" },
    )
    log.info("decks imported to {}", config.deckStoreDir.absolutePath)
    log.info(
        "auth mode {}; accounts in {}",
        config.authMode.name.lowercase(), config.accountsDir.absolutePath,
    )
    if (config.authMode == AuthMode.REQUIRED) {

        log.warn("auth mode required: this bridge must only be reached over wss://")
        log.info(
            if (config.allowedEmails.isEmpty()) {
                "no BRIDGE_ALLOWED_EMAILS: any Google account may sign in"
            } else {
                "allow-list: ${config.allowedEmails.size} email address(es) may sign in"
            },
        )
    }

    val deckPool = DeckPool(config.decks)
    val playmatPool = PlaymatPool()
    val namePool = NamePool()

    val deckStore = DeckStore(config.deckStoreDir)
    val playmatImageStore = PlaymatImageStore(config.playmatImageDir)

    val accountStore = H2AccountStore(config.accountsDir)
    Runtime.getRuntime().addShutdownHook(Thread { accountStore.close() })
    val identity = IdentityService(
        mode = config.authMode,
        accounts = accountStore,
        tickets = config.authSecret?.let { SessionTickets(it, config.ticketLifetime) },
        verifier = config.googleClientId?.let { GoogleIdTokenVerifier(it) },
        allowedEmails = config.allowedEmails,
    )

    val accountSessions = AccountSessions()
    val accountGames = AccountGames()

    embeddedServer(CIO, host = config.bridgeHost, port = config.bridgePort) {

        install(XForwardedHeaders)
        install(WebSockets) {
            contentConverter = KotlinxWebsocketSerializationConverter(json)

            pingPeriod = Duration.ofSeconds(5)
            timeout = Duration.ofSeconds(15)
        }
        routing {
            webSocket("/ws") {
                serveSession(
                    config, deckPool, playmatPool, namePool, deckStore, identity, accountSessions, accountGames,
                )
            }
            post("/playmats") { call.uploadPlaymatImage(playmatImageStore, identity) }
            get("/playmats/mine") { call.findMyPlaymatImage(playmatImageStore, identity) }
            get("/playmats/{id}") { call.servePlaymatImage(playmatImageStore) }
        }
    }.start(wait = true)
}

@Serializable
private data class PlaymatImageUploaded(val id: String)

@Serializable
private data class PlaymatImageError(val error: String)

private suspend fun ApplicationCall.uploadPlaymatImage(store: PlaymatImageStore, identity: IdentityService) {

    val declaredLength = request.headers[HttpHeaders.ContentLength]?.toLongOrNull()
    if (declaredLength != null && declaredLength > PlaymatImageStore.MAX_BYTES) {
        respondText(
            json.encodeToString(
                PlaymatImageError.serializer(),
                PlaymatImageError("image is $declaredLength bytes; the limit is " +
                    "${PlaymatImageStore.MAX_BYTES / (1024 * 1024)} MB"),
            ),
            ContentType.Application.Json,
            HttpStatusCode.PayloadTooLarge,
        )
        return
    }
    val contentType = request.contentType().withoutParameters().toString()
    try {
        val bytes = receive<ByteArray>()
        val saved = store.save(bytes, contentType, ownerKey(identity))
        respondText(
            json.encodeToString(PlaymatImageUploaded.serializer(), PlaymatImageUploaded(saved.id)),
            ContentType.Application.Json,
            HttpStatusCode.Created,
        )
    } catch (e: IllegalArgumentException) {
        respondText(
            json.encodeToString(PlaymatImageError.serializer(), PlaymatImageError(e.message ?: "bad request")),
            ContentType.Application.Json,
            HttpStatusCode.BadRequest,
        )
    } catch (t: Throwable) {
        log.warn("playmat image upload failed", t)
        respondText(
            json.encodeToString(PlaymatImageError.serializer(), PlaymatImageError("upload failed")),
            ContentType.Application.Json,
            HttpStatusCode.InternalServerError,
        )
    }
}

@Serializable
private data class PlaymatImageMine(val id: String?)

private suspend fun ApplicationCall.findMyPlaymatImage(store: PlaymatImageStore, identity: IdentityService) {
    val id = store.currentImageId(ownerKey(identity))
    respondText(
        json.encodeToString(PlaymatImageMine.serializer(), PlaymatImageMine(id)),
        ContentType.Application.Json,
    )
}

private fun ApplicationCall.ownerKey(identity: IdentityService): String {
    val ticket = request.headers[HttpHeaders.Authorization]?.removePrefix("Bearer ")?.trim()
    val accountId = ticket?.takeIf { it.isNotEmpty() }?.let(identity::accountIdForTicket)
    return if (accountId != null) "acct:$accountId" else "ip:${request.origin.remoteHost}"
}

private suspend fun ApplicationCall.servePlaymatImage(store: PlaymatImageStore) {
    val id = parameters["id"]
    val saved = id?.let(store::find)
    if (saved == null) {
        respondText("not found", status = HttpStatusCode.NotFound)
        return
    }

    response.headers.append(HttpHeaders.CacheControl, "public, max-age=31536000, immutable")

    response.headers.append("X-Content-Type-Options", "nosniff")
    respondBytes(saved.file.readBytes(), ContentType.parse(saved.contentType))
}

private suspend fun io.ktor.server.websocket.DefaultWebSocketServerSession.serveSession(
    config: Config,
    deckPool: DeckPool,
    playmatPool: PlaymatPool,
    namePool: NamePool,
    deckStore: DeckStore,
    identity: IdentityService,
    accountSessions: AccountSessions,
    accountGames: AccountGames,
) {
    val sessionId = UUID.randomUUID().toString()
    val bridge = BridgeSession(sessionId, config, deckPool, playmatPool, namePool, deckStore, accountGames)
    val dispatch = ActionDispatch(bridge, identity, accountSessions)
    log.info("websocket session {} opened", sessionId)

    try {
        coroutineScope {
            launch {
                for (message in bridge.outbound) {
                    send(Frame.Text(json.encodeToString(ServerMessage.serializer(), message)))
                }

                close(CloseReason(CloseReason.Codes.NORMAL, bridge.endCloseReason))
            }

            bridge.send(
                Hello(
                    bridgeSessionId = sessionId,
                    xmageServerHost = config.xmageHost,
                    xmageServerPort = config.xmagePort,

                    authMode = config.authMode.name.lowercase(),
                    googleClientId = config.googleClientId
                        .takeIf { config.authMode == AuthMode.REQUIRED },
                )
            )

            val idleWatchdog = launch {
                delay(UNAUTHENTICATED_IDLE.toMillis())
                if (!bridge.isConnected) {
                    log.info(
                        "websocket session {} unauthenticated after {}s, closing",
                        sessionId, UNAUTHENTICATED_IDLE.seconds,
                    )
                    bridge.endWith(
                        Failure(reason = "no login within ${UNAUTHENTICATED_IDLE.seconds}s"),
                        closeReason = "unauthenticated idle timeout",
                    )
                }
            }

            var failedLogins = 0
            for (frame in incoming) {
                val text = (frame as? Frame.Text)?.readText() ?: continue
                val message = try {
                    json.decodeFromString(ClientMessage.serializer(), text)
                } catch (e: SerializationException) {
                    bridge.send(Failure(reason = "could not parse message: ${e.message}"))
                    continue
                }
                dispatch.handle(message)

                if (message is Login && !bridge.isConnected) {
                    failedLogins++
                    if (failedLogins >= MAX_FAILED_LOGINS) {
                        log.info(
                            "websocket session {} closed after {} failed logins", sessionId, failedLogins,
                        )
                        bridge.endWith(
                            Failure(action = message.actionType, reason = "too many failed logins"),
                            closeReason = "too many failed logins",
                        )
                        break
                    }
                }
            }
            idleWatchdog.cancel()
        }
    } catch (e: ClosedReceiveChannelException) {
        log.info("websocket session {} closed by peer", sessionId)
    } catch (t: Throwable) {
        log.warn("websocket session {} failed", sessionId, t)
    } finally {

        accountSessions.release(bridge)
        bridge.close()
        log.info("websocket session {} torn down", sessionId)
    }
}
