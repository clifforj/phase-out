package online.commander.bridge

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withContext
import mage.cards.decks.DeckCardLists
import mage.constants.ManaType
import mage.constants.MultiplayerAttackOption
import mage.constants.PlayerAction
import mage.constants.RangeOfInfluence
import mage.constants.SkillLevel
import mage.constants.TableState
import mage.game.match.MatchOptions
import mage.interfaces.MageClient
import mage.interfaces.callback.ClientCallback
import mage.interfaces.callback.ClientCallbackMethod
import mage.players.PlayerType
import mage.players.net.UserData
import mage.remote.Connection
import mage.remote.SessionImpl
import mage.utils.MageVersion
import mage.view.AbilityPickerView
import mage.view.ChatMessage
import mage.view.GameClientMessage
import mage.view.GameEndView
import mage.view.GameView
import mage.view.TableClientMessage
import mage.view.TableView
import online.commander.bridge.auth.AccountGames
import org.slf4j.LoggerFactory
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class BridgeSession(
    val id: String,
    private val config: Config,

    val deckPool: DeckPool = DeckPool(config.decks),
    val playmatPool: PlaymatPool = PlaymatPool(),
    val namePool: NamePool = NamePool(),

    val deckStore: DeckStore = DeckStore(config.deckStoreDir),

    private val accountGames: AccountGames = AccountGames(),
) : AutoCloseable {

    private val log = LoggerFactory.getLogger("bridge.session.$id")

    val outbound: Channel<ServerMessage> = Channel(Channel.UNLIMITED)

    private val executor = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "xmage-session-$id").apply { isDaemon = true }
    }
    private val dispatcher: CoroutineDispatcher = executor.asCoroutineDispatcher()

    private val mageClient = BridgeMageClient()
    private val session = SessionImpl(mageClient)

    @Volatile
    var userName: String? = null
        private set

    @Volatile
    private var accountId: String? = null

    val fallbackUserName: String get() = "${config.userNamePrefix}-${id.take(6)}"

    private val promptKinds = ConcurrentHashMap<UUID, PromptKind>()

    private val myPlayerIds = ConcurrentHashMap<UUID, UUID>()

    private val gameTables = ConcurrentHashMap<UUID, UUID>()

    private val chatTables = ConcurrentHashMap<UUID, UUID>()

    private val attachedGames = ConcurrentHashMap.newKeySet<UUID>()

    private val gameRoles = ConcurrentHashMap<UUID, GameRole>()

    private val myTableIds = ConcurrentHashMap.newKeySet<UUID>()

    private val lookedAtWindows = ConcurrentHashMap<UUID, LookedAtWindows>()

    private val revealedWindows = ConcurrentHashMap<UUID, RevealedWindows>()

    fun send(message: ServerMessage) {
        val result = outbound.trySend(message)
        if (result.isFailure) log.warn("dropped outbound message, channel closed: {}", message)
    }

    fun endWith(message: ServerMessage, closeReason: String = "session taken over") {
        endCloseReason = closeReason
        send(message)
        outbound.close()
    }

    @Volatile
    var endCloseReason: String = "session taken over"
        private set

    fun promptKind(gameId: UUID): PromptKind = promptKinds[gameId] ?: PromptKind.NONE

    fun myPlayerId(gameId: UUID): UUID? = myPlayerIds[gameId]

    fun gameRole(gameId: UUID): GameRole = gameRoles[gameId] ?: GameRole.PLAYER

    suspend fun login(
        requestedName: String?,
        password: String,
        echo: LoginEcho? = null,
    ): Boolean = withContext(dispatcher) {
        val name = requestedName?.takeIf { it.isNotBlank() } ?: fallbackUserName
        val connection = Connection().apply {
            host = config.xmageHost
            port = config.xmagePort
            username = name
            setPassword(password)
            proxyType = Connection.ProxyType.NONE
            userIdStr = "bridge:$id"

            userData = UserData.getDefaultUserDataView()
        }

        val connected = session.connectStart(connection)
        if (connected) {
            userName = session.userName ?: name
            accountId = echo?.accountId
            startPinging()
            send(
                LoggedIn(
                    userName = userName ?: name,
                    serverVersion = session.versionInfo ?: "unknown",
                    mainRoomId = session.mainRoomId?.toString() ?: "",
                    sessionToken = echo?.sessionToken,
                    displayName = echo?.displayName,
                    email = echo?.email,
                    accountId = echo?.accountId,
                    playerName = echo?.playerName,
                )
            )
        }
        connected
    }

    fun rejoinKnownSeat() {
        val id = accountId ?: return
        val seat = accountGames.seat(id) ?: return
        log.info("rejoining known seat: game={} table={}", seat.gameId, seat.tableId)
        startAsPlayer(seat.gameId, seat.tableId, seat.playerId)
    }

    suspend fun setSkipPrioritySteps(settings: SetSkipPrioritySteps): Unit = withContext(dispatcher) {
        val userData = UserData.getDefaultUserDataView()
        userData.userSkipPrioritySteps.yourTurn.apply {
            setUpkeep(settings.yourTurn.upkeep)
            setDraw(settings.yourTurn.draw)
            setMain1(settings.yourTurn.main1)
            setBeforeCombat(settings.yourTurn.beforeCombat)
            setEndOfCombat(settings.yourTurn.endOfCombat)
            setMain2(settings.yourTurn.main2)
            setEndOfTurn(settings.yourTurn.endOfTurn)
        }
        userData.userSkipPrioritySteps.opponentTurn.apply {
            setUpkeep(settings.opponentTurn.upkeep)
            setDraw(settings.opponentTurn.draw)
            setMain1(settings.opponentTurn.main1)
            setBeforeCombat(settings.opponentTurn.beforeCombat)
            setEndOfCombat(settings.opponentTurn.endOfCombat)
            setMain2(settings.opponentTurn.main2)
            setEndOfTurn(settings.opponentTurn.endOfTurn)
        }
        userData.userSkipPrioritySteps.apply {
            setStopOnDeclareAttackersDuringSkipActions(settings.stopOnDeclareAttackers)
            setStopOnDeclareBlockersWithZeroPermanents(settings.stopOnDeclareBlockersWithZeroPermanents)
            setStopOnDeclareBlockersWithAnyPermanents(settings.stopOnDeclareBlockersWithAnyPermanents)
            setStopOnAllMainPhases(settings.stopOnAllMainPhases)
            setStopOnAllEndPhases(settings.stopOnAllEndPhases)
            setStopOnStackNewObjects(settings.stopOnStackNewObjects)
        }
        userData.setPassPriorityCast(settings.passPriorityCast)
        userData.setPassPriorityActivation(settings.passPriorityActivation)
        require(session.updatePreferencesForServer(userData)) {
            "server rejected the preference update" + (lastError?.let { ": $it" } ?: "")
        }
    }

    private fun startPinging() {
        executor.scheduleAtFixedRate(
            {
                try {
                    if (session.isConnected) session.ping()
                } catch (t: Throwable) {
                    log.debug("ping failed", t)
                }
            },
            PING_INTERVAL_SECONDS,
            PING_INTERVAL_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    val isConnected: Boolean get() = session.isConnected

    val lastError: String? get() = session.lastError?.takeIf { it.isNotBlank() }

    private val closedSignal = CompletableDeferred<Unit>()

    suspend fun awaitClosed() {
        closedSignal.await()
    }

    override fun close() {
        try {
            if (session.isConnected) leaveMyTables()
        } catch (t: Throwable) {
            log.debug("error leaving tables on session close", t)
        }
        try {

            if (session.isConnected) session.connectStop(false, true)
        } catch (t: Throwable) {
            log.debug("error stopping xmage session", t)
        }
        outbound.close()
        executor.shutdownNow()
        closedSignal.complete(Unit)
    }

    private fun leaveMyTables() {
        val roomId = session.mainRoomId ?: return
        for (tableId in myTableIds) {
            try {
                session.leaveTable(roomId, tableId)
            } catch (t: Throwable) {
                log.debug("error leaving table {} on session close", tableId, t)
            }
        }
    }

    suspend fun listTables(): Pair<UUID, List<TableView>> = withContext(dispatcher) {
        val roomId = requireNotNull(session.mainRoomId) { "no main room; not logged in?" }
        roomId to (session.getTables(roomId)?.filterNotNull() ?: emptyList())
    }

    suspend fun createTable(
        name: String?,
        gameType: String?,
        deckType: String?,
        players: Int,
        aiOpponents: Int,
    ): Pair<UUID, TableView> = withContext(dispatcher) {
        val roomId = requireNotNull(session.mainRoomId) { "no main room; not logged in?" }
        val options = matchOptions(name, gameType, deckType, players, aiOpponents)
        val table = requireNotNull(session.createTable(roomId, options)) {
            "server refused to create the table" + (lastError?.let { ": $it" } ?: "")
        }
        myTableIds.add(table.tableId)
        roomId to table
    }

    private fun matchOptions(
        name: String?,
        gameType: String?,
        deckType: String?,
        players: Int,
        aiOpponents: Int,
    ): MatchOptions {

        val resolvedGameType = gameType
            ?: if (players > 2) config.multiplayerGameType else config.defaultGameType
        require(players <= config.maxPlayersPerTable) {
            "requested $players seats, but the bridge allows at most " +
                "${config.maxPlayersPerTable} (BRIDGE_MAX_PLAYERS); the server runs out of heap " +
                "on very large tables and takes other players' sessions down with it"
        }
        val totalPlayers = players.coerceAtLeast(2)
        val bots = aiOpponents.coerceIn(0, totalPlayers - 1)
        val multiPlayer = totalPlayers > 2
        return MatchOptions(name ?: "bridge table", resolvedGameType, multiPlayer).apply {
            repeat(totalPlayers - bots) { playerTypes.add(PlayerType.HUMAN) }
            repeat(bots) { playerTypes.add(PlayerType.COMPUTER_MAD) }
            setDeckType(deckType ?: config.defaultDeckType)

            attackOption = MultiplayerAttackOption.MULTIPLE
            range = RangeOfInfluence.ALL
            winsNeeded = 1
            freeMulligans = 1
            skillLevel = SkillLevel.CASUAL
            isRollbackTurnsAllowed = true
            isSpectatorsAllowed = true
            quitRatio = 100
            minimumRating = 0
        }
    }

    suspend fun joinTable(
        roomId: UUID,
        tableId: UUID,
        seatName: String,
        playerType: PlayerType,
        deck: DeckCardLists,
    ): Boolean = withContext(dispatcher) {
        session.joinTable(roomId, tableId, seatName, playerType, 1, deck, "")
            .also { joined -> if (joined) myTableIds.add(tableId) }
    }

    suspend fun startMatch(roomId: UUID, tableId: UUID): Boolean = withContext(dispatcher) {
        session.startMatch(roomId, tableId)
    }

    suspend fun leaveTable(roomId: UUID, tableId: UUID): Boolean = withContext(dispatcher) {
        session.leaveTable(roomId, tableId)
            .also { left -> if (left) myTableIds.remove(tableId) }
    }

    suspend fun findTable(roomId: UUID, tableId: UUID): TableView? = withContext(dispatcher) {
        session.getTable(roomId, tableId).orElse(null)
    }

    suspend fun hasActiveGame(): Boolean = withContext(dispatcher) {
        val roomId = session.mainRoomId ?: return@withContext false
        myTableIds.any { tableId ->
            session.getTable(roomId, tableId).orElse(null)?.tableState == TableState.DUELING
        }
    }

    suspend fun watchTable(roomId: UUID, tableId: UUID): Boolean = withContext(dispatcher) {
        session.watchTable(roomId, tableId)
    }

    suspend fun stopWatching(gameId: UUID): Boolean = withContext(dispatcher) {
        val stopped = session.stopWatching(gameId)
        attachedGames.remove(gameId)
        gameRoles.remove(gameId)
        promptKinds.remove(gameId)
        lookedAtWindows.remove(gameId)
        revealedWindows.remove(gameId)
        stopped
    }

    suspend fun mainRoomId(): UUID? = withContext(dispatcher) { session.mainRoomId }

    fun loadDeck(deckId: String?, path: String?, tableId: UUID? = null, owner: String? = null): DeckCardLists {
        if (deckId != null) {
            val chosen = deckStore.find(owner, deckId)?.file ?: deckPool.find(deckId)
            requireNotNull(chosen) { "no deck '$deckId'; import it first or list your decks" }
            return DeckFile.read(chosen)
        }
        val file = path?.let(::File)
            ?: tableId?.let(deckPool::dealTo)
            ?: deckPool.deal(1).firstOrNull()
        requireNotNull(file) {
            "no deck available; set BRIDGE_DECK_FILE or BRIDGE_DECK_DIR, or pass deckId/deckFile " +
                "(looked for .dck files in ${Config.DECK_DIR_CANDIDATES.joinToString()})"
        }
        return DeckFile.read(file)
    }

    fun loadDecks(path: String?, count: Int): List<DeckCardLists> {
        if (path != null) return List(count) { loadDeck(null, path) }
        val files = deckPool.deal(count)
        require(files.size == count) {
            "no deck available; set BRIDGE_DECK_FILE or BRIDGE_DECK_DIR, or pass deckId/deckFile " +
                "(looked for .dck files in ${Config.DECK_DIR_CANDIDATES.joinToString()})"
        }
        return files.map(DeckFile::read)
    }

    fun forgetDeal(tableId: UUID) = deckPool.forget(tableId)

    suspend fun sendPlayerUUID(gameId: UUID, data: UUID?): Boolean =
        withContext(dispatcher) { session.sendPlayerUUID(gameId, data) }

    suspend fun sendPlayerBoolean(gameId: UUID, data: Boolean): Boolean =
        withContext(dispatcher) { session.sendPlayerBoolean(gameId, data) }

    suspend fun sendPlayerInteger(gameId: UUID, data: Int): Boolean =
        withContext(dispatcher) { session.sendPlayerInteger(gameId, data) }

    suspend fun sendPlayerString(gameId: UUID, data: String): Boolean =
        withContext(dispatcher) { session.sendPlayerString(gameId, data) }

    suspend fun sendPlayerManaType(gameId: UUID, playerId: UUID, data: ManaType): Boolean =
        withContext(dispatcher) { session.sendPlayerManaType(gameId, playerId, data) }

    suspend fun sendPlayerAction(action: PlayerAction, gameId: UUID, data: Any?): Boolean =
        withContext(dispatcher) { session.sendPlayerAction(action, gameId, data) }

    suspend fun quitMatch(gameId: UUID): Boolean =
        withContext(dispatcher) { session.quitMatch(gameId) }

    private inner class BridgeMageClient : MageClient {

        override fun getVersion(): MageVersion = MageVersion(MageVersion::class.java)

        override fun onNewConnection() {
            promptKinds.clear()
            myPlayerIds.clear()
            attachedGames.clear()
            gameRoles.clear()
            lookedAtWindows.clear()
            revealedWindows.clear()
        }

        override fun connected(message: String) {
            log.info("xmage connected: {}", message)
        }

        override fun disconnected(askToReconnect: Boolean, keepMySessionActive: Boolean) {
            log.info(
                "xmage disconnected (askToReconnect={}, keepMySessionActive={})",
                askToReconnect, keepMySessionActive,
            )
            send(DisconnectedMsg(askToReconnect, keepMySessionActive))
        }

        override fun showMessage(message: String) {
            send(Notice(NoticeLevel.INFO, message))
        }

        override fun showError(message: String) {
            send(Notice(NoticeLevel.ERROR, message))
        }

        override fun onCallback(callback: ClientCallback) {
            try {

                callback.decompressData()
                dispatch(callback)
            } catch (t: Throwable) {

                log.error("failed handling callback {}", callback.method, t)
                send(Notice(NoticeLevel.ERROR, "bridge failed to translate ${callback.method}: $t"))
            }
        }
    }

    private fun dispatch(callback: ClientCallback) {
        val objectId: UUID? = callback.objectId
        val data: Any? = callback.data

        when (callback.method) {

            ClientCallbackMethod.JOINED_TABLE -> {
                val message = data as TableClientMessage
                send(
                    TableJoined(
                        roomId = message.roomId?.toString() ?: "",
                        tableId = message.currentTableId?.toString() ?: "",
                        isTournament = message.flag,
                    )
                )
            }

            ClientCallbackMethod.START_GAME -> {
                val message = data as TableClientMessage
                val gameId = message.gameId ?: objectId ?: return
                log.info(
                    "START_GAME game={} table={} player={}",
                    gameId, message.currentTableId, message.playerId,
                )
                startAsPlayer(gameId, message.currentTableId, message.playerId)
            }

            ClientCallbackMethod.WATCHGAME -> {
                val gameId = objectId ?: return
                val message = data as? TableClientMessage
                attachToGame(gameId, GameRole.SPECTATOR, message?.currentTableId)
            }

            ClientCallbackMethod.GAME_INIT -> {
                val gameId = objectId ?: return
                promptKinds[gameId] = PromptKind.NONE
                send(gameStateMessage(gameId, callback.method, data as GameView, null))
            }

            ClientCallbackMethod.GAME_UPDATE -> {
                val gameId = objectId ?: return
                send(gameStateMessage(gameId, callback.method, data as GameView, null))
            }

            ClientCallbackMethod.GAME_UPDATE_AND_INFORM -> {
                val gameId = objectId ?: return
                val message = data as GameClientMessage
                send(gameStateMessage(gameId, callback.method, message.gameView, message.message))
            }

            ClientCallbackMethod.GAME_INFORM_PERSONAL -> {
                val message = data as GameClientMessage
                send(
                    Notice(
                        level = NoticeLevel.INFO,
                        text = message.message ?: "",
                        title = "Game message",
                        gameId = objectId?.toString(),
                    )
                )
            }

            ClientCallbackMethod.GAME_SELECT -> prompt(objectId, PromptKind.GAME_SELECT, data)
            ClientCallbackMethod.GAME_ASK -> prompt(objectId, PromptKind.GAME_ASK, data)
            ClientCallbackMethod.GAME_TARGET -> prompt(objectId, PromptKind.GAME_TARGET, data)
            ClientCallbackMethod.GAME_CHOOSE_PILE -> prompt(objectId, PromptKind.GAME_CHOOSE_PILE, data)
            ClientCallbackMethod.GAME_CHOOSE_CHOICE -> prompt(objectId, PromptKind.GAME_CHOOSE_CHOICE, data)
            ClientCallbackMethod.GAME_PLAY_MANA -> prompt(objectId, PromptKind.GAME_PLAY_MANA, data)
            ClientCallbackMethod.GAME_PLAY_XMANA -> prompt(objectId, PromptKind.GAME_PLAY_XMANA, data)
            ClientCallbackMethod.GAME_GET_AMOUNT -> prompt(objectId, PromptKind.GAME_GET_AMOUNT, data)
            ClientCallbackMethod.GAME_GET_MULTI_AMOUNT ->
                prompt(objectId, PromptKind.GAME_GET_MULTI_AMOUNT, data)

            ClientCallbackMethod.GAME_CHOOSE_ABILITY -> {
                val gameId = objectId ?: return
                val view = data as AbilityPickerView
                promptKinds[gameId] = PromptKind.GAME_CHOOSE_ABILITY
                send(
                    PromptMsg(
                        gameId = gameId.toString(),
                        prompt = ViewMapping.abilityPrompt(view),
                        game = view.gameView?.let { gameState(gameId, it) },
                    )
                )
            }

            ClientCallbackMethod.GAME_OVER -> {
                val gameId = objectId ?: return
                val message = data as GameClientMessage
                promptKinds[gameId] = PromptKind.NONE
                send(
                    GameOver(
                        gameId = gameId.toString(),
                        text = message.message?.let { substituteNames(it, namesForGame(gameId)) },
                        game = message.gameView?.let { gameState(gameId, it) },
                    )
                )
            }

            ClientCallbackMethod.END_GAME_INFO -> {
                val view = data as? GameEndView

                if (objectId != null) accountId?.let { accountGames.forget(it, objectId) }
                val names = namesForGame(objectId)
                send(
                    MatchOver(
                        gameId = objectId?.toString() ?: "",
                        gameInfo = view?.gameInfo?.let { substituteNames(it, names) },
                        matchInfo = view?.matchInfo?.let { substituteNames(it, names) },
                        additionalInfo = view?.additionalInfo?.let { substituteNames(it, names) },
                        wins = view?.wins ?: 0,
                        losses = view?.loses ?: 0,
                        winsNeeded = view?.winsNeeded ?: 0,
                    )
                )
            }

            ClientCallbackMethod.GAME_ERROR -> {
                send(
                    Notice(
                        level = NoticeLevel.ERROR,
                        text = data as? String ?: "unknown game error",
                        title = "Game error",
                        gameId = objectId?.toString(),
                    )
                )
            }

            ClientCallbackMethod.CHATMESSAGE -> {
                val message = data as ChatMessage
                val names = namesForChat(objectId)
                send(
                    Chat(
                        objectId = objectId?.toString() ?: "",
                        from = message.username?.let { names[it] ?: it },
                        text = substituteNames(
                            stripEngineBranding(message.message, message.messageType),
                            names,
                        ),
                        turnInfo = message.turnInfo,
                        messageType = message.messageType?.name,
                    )
                )
            }

            ClientCallbackMethod.SERVER_MESSAGE -> {
                val message = data as? ChatMessage
                send(Notice(NoticeLevel.INFO, message?.message ?: "", title = "Server message"))
            }

            ClientCallbackMethod.SHOW_USERMESSAGE -> {
                @Suppress("UNCHECKED_CAST")
                val parts = data as? List<String> ?: emptyList()
                send(
                    Notice(
                        level = NoticeLevel.INFO,
                        text = parts.getOrElse(1) { "" },
                        title = parts.getOrNull(0),
                    )
                )
            }

            ClientCallbackMethod.GAME_REDRAW_GUI -> Unit

            else -> send(
                Unmapped(
                    callbackMethod = callback.method.name,
                    objectId = objectId?.toString(),
                    payloadClass = data?.javaClass?.name,
                )
            )
        }
    }

    private fun stripEngineBranding(text: String?, type: ChatMessage.MessageType?): String {
        val raw = text ?: ""
        if (type != ChatMessage.MessageType.STATUS) return raw
        return raw.replace(" XMage", "")
    }

    private fun substituteNames(text: String, names: Map<String, String>): String =
        ViewMapping.substituteNames(text, names)

    private fun prompt(gameId: UUID?, kind: PromptKind, data: Any?) {
        if (gameId == null) return
        val message = data as GameClientMessage
        promptKinds[gameId] = kind
        send(
            PromptMsg(
                gameId = gameId.toString(),
                prompt = ViewMapping.prompt(kind, message),
                game = message.gameView?.let { gameState(gameId, it) },
            )
        )
    }

    private fun gameStateMessage(
        gameId: UUID,
        method: ClientCallbackMethod,
        view: GameView?,
        message: String?,
    ): ServerMessage {
        if (view == null) {
            return Notice(
                level = NoticeLevel.ERROR,
                text = "$method arrived without a game view",
                gameId = gameId.toString(),
            )
        }

        ViewMapping.myPlayerId(view)?.let { myPlayerIds.putIfAbsent(gameId, it) }
        return GameStateMsg(
            gameId = gameId.toString(),
            reason = method.name,
            message = message,
            game = gameState(gameId, view),
        )
    }

    private fun gameState(gameId: UUID, view: GameView): GameStateView {
        val playmats = gameTables[gameId]?.let(playmatPool::at) ?: emptyMap()
        val names = gameTables[gameId]?.let(namePool::at) ?: emptyMap()
        val mapped = ViewMapping.gameState(view, playmats, names)
        val withLookedAt = lookedAtWindows.computeIfAbsent(gameId) { LookedAtWindows() }.fold(mapped)
        return revealedWindows.computeIfAbsent(gameId) { RevealedWindows() }.fold(withLookedAt)
    }

    private fun namesForChat(chatId: UUID?): Map<String, String> =
        chatId?.let { chatTables[it] }?.let(namePool::at) ?: emptyMap()

    private fun namesForGame(gameId: UUID?): Map<String, String> =
        gameId?.let { gameTables[it] }?.let(namePool::at) ?: emptyMap()

    private fun startAsPlayer(gameId: UUID, tableId: UUID?, playerId: UUID?) {
        playerId?.let { myPlayerIds[gameId] = it }
        tableId?.let { gameTables[gameId] = it }
        send(
            GameStarted(
                gameId = gameId.toString(),
                tableId = tableId?.toString(),
                myPlayerId = playerId?.toString(),
                role = GameRole.PLAYER,
            )
        )

        attachToGame(gameId, GameRole.PLAYER, tableId)
        val account = accountId
        if (account != null && tableId != null && playerId != null) {
            accountGames.record(account, AccountGames.Seat(tableId, gameId, playerId))
        }
    }

    private fun attachToGame(gameId: UUID, role: GameRole, tableId: UUID?) {
        if (!attachedGames.add(gameId)) return
        gameRoles[gameId] = role
        executor.execute {
            try {
                val attached = when (role) {
                    GameRole.PLAYER -> session.joinGame(gameId)
                    GameRole.SPECTATOR -> session.watchGame(gameId)
                }
                if (!attached) {
                    log.warn("could not attach to game {} as {}", gameId, role)
                    send(
                        Notice(
                            level = NoticeLevel.ERROR,
                            text = when (role) {
                                GameRole.PLAYER -> "could not join game $gameId"
                                GameRole.SPECTATOR -> "could not watch game $gameId; the " +
                                    "server refused (already watching it, or you are a " +
                                    "player in it)"
                            },
                            gameId = gameId.toString(),
                        )
                    )
                    attachedGames.remove(gameId)
                    gameRoles.remove(gameId)
                    return@execute
                }

                if (role == GameRole.SPECTATOR) {
                    send(
                        GameStarted(
                            gameId = gameId.toString(),
                            tableId = tableId?.toString(),
                            myPlayerId = null,
                            role = GameRole.SPECTATOR,
                        )
                    )
                }
                session.getGameChatId(gameId).ifPresent { chatId ->
                    if (!session.joinChat(chatId)) log.warn("joinChat({}) refused", chatId)
                    tableId?.let { chatTables[chatId] = it }
                }
                if (role == GameRole.PLAYER) {

                    session.sendPlayerString(gameId, "")
                }
            } catch (t: Throwable) {
                log.error("failed attaching to game {} as {}", gameId, role, t)
            }
        }
    }

    companion object {

        const val PING_INTERVAL_SECONDS = 20L
    }
}

data class LoginEcho(
    val sessionToken: String,
    val displayName: String?,
    val email: String?,
    val accountId: String,
    val playerName: String,
)
