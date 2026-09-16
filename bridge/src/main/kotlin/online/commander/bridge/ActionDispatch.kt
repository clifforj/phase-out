package online.commander.bridge

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import mage.constants.ManaType
import mage.constants.PlayerAction
import mage.constants.TableState
import mage.players.PlayerType
import online.commander.bridge.auth.AccountSessions
import online.commander.bridge.auth.AuthFailure
import online.commander.bridge.auth.IdentityService
import online.commander.bridge.identity.Account
import org.slf4j.LoggerFactory
import java.util.UUID

class ActionDispatch(
    private val bridge: BridgeSession,
    private val identity: IdentityService,

    private val accountSessions: AccountSessions,
) {

    private val log = LoggerFactory.getLogger("bridge.dispatch")

    private var account: Account? = null

    private companion object {
        const val MAX_DECKLIST_CHARS = 1_000_000
    }

    suspend fun handle(message: ClientMessage) {
        val action = message.actionType
        try {
            when (message) {
                is Login -> login(message)
                is ListTables -> listTables(message)
                is CreateTable -> createTable(message)
                is JoinTable -> joinTable(message)
                is StartMatch -> startMatch(message)
                is LeaveTable -> leaveTable(message)
                is QuickGame -> quickGame(message)
                is WatchTable -> watchTable(message)
                is StopWatching -> stopWatching(message)
                is ImportDeck -> importDeck(message)
                is ListDecks -> listDecks(message)
                is DeleteDeck -> deleteDeck(message)
                is ViewDeck -> viewDeck(message)
                is SetSkipPrioritySteps -> setSkipPrioritySteps(message)
                is SetPlayerName -> setPlayerName(message)
                is SignOut -> signOut(message)
                is GameAction -> gameAction(message)
            }
        } catch (e: AuthFailure) {

            log.info("action {} refused: {} ({})", action, e.message, e.code)
            bridge.send(
                Failure(
                    requestId = message.requestId,
                    action = action,
                    reason = e.message ?: e.code,
                    code = e.code,
                )
            )
        } catch (t: Throwable) {
            log.warn("action {} failed", action, t)
            bridge.send(
                Failure(
                    requestId = message.requestId,
                    action = action,
                    reason = t.message ?: t.toString(),
                )
            )
        }
    }

    private suspend fun login(message: Login) {
        if (bridge.isConnected) {
            fail(message, "already logged in as ${bridge.userName}")
            return
        }

        val resolution = withContext(Dispatchers.IO) {
            identity.resolve(message, bridge.fallbackUserName)
        }
        val ok = when (resolution) {
            is IdentityService.Resolution.Anonymous ->
                bridge.login(resolution.name, message.password)

            is IdentityService.Resolution.Authenticated -> {

                if (!message.force && accountSessions.heldByAnother(resolution.account.id, bridge)) {
                    fail(
                        message,
                        "this account is already open in another tab",
                        code = FailureCodes.SESSION_IN_USE,
                        activeGame = accountSessions.holderHasActiveGame(resolution.account.id),
                    )
                    return
                }
                if (message.force) {
                    log.info("account {} taking over via forced login", resolution.account.id)
                }
                val evicted = accountSessions.claim(resolution.account.id, bridge)

                if (evicted != null) {
                    try {
                        withTimeout(5_000) { evicted.awaitClosed() }
                    } catch (e: TimeoutCancellationException) {
                        log.warn(
                            "evicted session {} had not closed 5s after eviction; " +
                                "proceeding with the new login anyway",
                            evicted.id,
                        )
                    }
                }
                bridge.login(
                    requestedName = resolution.account.handle,
                    password = "",
                    echo = LoginEcho(
                        sessionToken = resolution.sessionToken,
                        displayName = resolution.account.displayName,
                        email = resolution.account.email,
                        accountId = resolution.account.id,
                        playerName = resolution.account.playerName,
                    ),
                )
            }
        }

        if (ok) {
            account = (resolution as? IdentityService.Resolution.Authenticated)?.account

            account?.let { bridge.rejoinKnownSeat() }
            ack(message, "connected")
        } else {
            accountSessions.release(bridge)
            fail(message, bridge.lastError ?: "login refused by server")
        }
    }

    private suspend fun setPlayerName(message: SetPlayerName) {
        val current = account ?: throw AuthFailure(
            FailureCodes.AUTH_REQUIRED,
            "not signed in, so there is no player name to set",
        )

        val updated = withContext(Dispatchers.IO) {
            identity.setPlayerName(current.id, message.playerName)
        } ?: throw AuthFailure(FailureCodes.AUTH_REJECTED, "this account no longer exists")

        account = updated
        ack(message, "player name is now '${updated.playerName}'")
    }

    private fun signOut(message: SignOut) {
        val had = account
        account = null
        accountSessions.release(bridge)
        ack(
            message,
            if (had != null) "signed out of '${had.handle}'" else "no account was signed in",
        )
    }

    private suspend fun setSkipPrioritySteps(message: SetSkipPrioritySteps) {
        requireConnected()
        bridge.setSkipPrioritySteps(message)
        ack(message, "priority skip settings updated for future tables")
    }

    private suspend fun listTables(message: ListTables) {
        requireConnected()
        val (roomId, tables) = bridge.listTables()
        bridge.send(
            Tables(
                roomId = roomId.toString(),
                tables = tables.map {
                    ViewMapping.table(it, bridge.deckPool.decksAt(it.tableId), bridge.namePool.at(it.tableId))
                },
            )
        )
        ack(message, "${tables.size} table(s)")
    }

    private suspend fun createTable(message: CreateTable) {
        requireConnected()
        val (roomId, table) = bridge.createTable(
            name = message.name,
            gameType = message.gameType,
            deckType = message.deckType,
            players = message.players,
            aiOpponents = message.aiOpponents,
        )
        bridge.send(
            TableCreated(
                roomId = roomId.toString(),
                tableId = table.tableId.toString(),
                gameType = table.gameType ?: "",
                deckType = table.deckType ?: "",
                seats = ViewMapping.table(
                    table, bridge.deckPool.decksAt(table.tableId), bridge.namePool.at(table.tableId),
                ).seats,
            )
        )
        ack(message, table.tableId.toString())
    }

    private suspend fun joinTable(message: JoinTable) {
        requireConnected()
        val roomId = requireNotNull(bridge.mainRoomId()) { "no main room" }
        val playerType = message.playerType?.let(::parsePlayerType) ?: PlayerType.HUMAN
        val tableId = UUID.fromString(message.tableId)
        val deck = bridge.loadDeck(message.deckId, message.deckFile, tableId, owner = account?.id)
        val seatName = message.seatName
            ?: if (playerType == PlayerType.HUMAN) bridge.userName ?: "player" else "Computer"
        val ok = bridge.joinTable(roomId, tableId, seatName, playerType, deck)
        if (ok) {
            bridge.deckPool.announce(tableId, seatName, deckSummary(deck))
            bridge.playmatPool.announce(tableId, seatName, message.playmatId)
            bridge.namePool.announce(tableId, seatName, account?.playerName)
            ack(message, "joined as $seatName (${playerType.name}) with ${deck.name}")
        } else {

            fail(message, "server refused the seat; see the accompanying notice")
        }
    }

    private suspend fun startMatch(message: StartMatch) {
        requireConnected()
        val roomId = requireNotNull(bridge.mainRoomId()) { "no main room" }
        val tableId = UUID.fromString(message.tableId)
        if (bridge.startMatch(roomId, tableId)) {
            bridge.forgetDeal(tableId)
            bridge.send(MatchStarting(roomId.toString(), tableId.toString()))
            ack(message, "match starting")
        } else {
            fail(message, "server refused to start the match")
        }
    }

    private suspend fun leaveTable(message: LeaveTable) {
        requireConnected()
        val roomId = requireNotNull(bridge.mainRoomId()) { "no main room" }
        if (bridge.leaveTable(roomId, UUID.fromString(message.tableId))) {
            ack(message, "left table")
        } else {
            fail(message, "server refused to leave the table")
        }
    }

    private suspend fun quickGame(message: QuickGame) {
        requireConnected()
        val aiOpponents = message.aiOpponents.coerceAtLeast(1)
        val chosen = message.deckId?.let { bridge.loadDeck(it, null, owner = account?.id) }
        val decks = bridge.loadDecks(message.deckFile, if (chosen != null) aiOpponents else 1 + aiOpponents)
        val myDeck = chosen ?: decks.first()
        val aiDecks = if (chosen != null) decks else decks.drop(1)

        val (roomId, table) = bridge.createTable(
            name = "${bridge.userName} vs AI",
            gameType = message.gameType,
            deckType = message.deckType,
            players = 1 + aiOpponents,
            aiOpponents = aiOpponents,
        )
        val tableId = table.tableId
        bridge.send(
            TableCreated(
                roomId = roomId.toString(),
                tableId = tableId.toString(),
                gameType = table.gameType ?: "",
                deckType = table.deckType ?: "",
                seats = ViewMapping.table(
                    table, bridge.deckPool.decksAt(tableId), bridge.namePool.at(tableId),
                ).seats,
            )
        )

        val me = bridge.userName ?: "player"
        require(bridge.joinTable(roomId, tableId, me, PlayerType.HUMAN, myDeck)) {
            "could not take the human seat; see the accompanying notice " +
                "(an illegal deck for this game type is the usual cause)"
        }
        bridge.deckPool.announce(tableId, me, deckSummary(myDeck))
        bridge.playmatPool.announce(tableId, me, message.playmatId)
        bridge.namePool.announce(tableId, me, account?.playerName)
        aiDecks.forEachIndexed { index, aiDeck ->
            val aiName = "Computer ${index + 1}"
            require(bridge.joinTable(roomId, tableId, aiName, PlayerType.COMPUTER_MAD, aiDeck)) {
                "could not seat AI opponent ${index + 1}"
            }
            bridge.deckPool.announce(tableId, aiName, deckSummary(aiDeck))
        }

        require(bridge.startMatch(roomId, tableId)) { "server refused to start the match" }
        bridge.send(MatchStarting(roomId.toString(), tableId.toString()))

        ack(
            message,
            "table ${tableId}, ${aiOpponents} AI opponent(s), match starting; " +
                "you: ${myDeck.name}, vs ${aiDecks.joinToString { it.name }}",
        )
    }

    private suspend fun watchTable(message: WatchTable) {
        requireConnected()
        val roomId = message.roomId?.let(UUID::fromString)
            ?: requireNotNull(bridge.mainRoomId()) { "no main room" }
        val tableId = UUID.fromString(message.tableId)

        val table = bridge.findTable(roomId, tableId)
        if (table == null) {

            fail(
                message,
                "no table $tableId in room $roomId; a finished table leaves the lobby, so " +
                    "the game may simply be over",
            )
            return
        }
        val state = table.tableState
        if (state != TableState.DUELING) {
            fail(
                message,
                "table $tableId is ${state?.name ?: "in an unknown state"} " +
                    "(\"${state?.toString() ?: "?"}\"); only a table in DUELING state can be " +
                    "watched - the server refuses to attach a spectator to a game that has not " +
                    "started or has already finished",
            )
            return
        }

        if (bridge.watchTable(roomId, tableId)) {
            ack(message, "asked to watch table $tableId; expect gameStarted role=spectator")
        } else {
            fail(message, "not connected")
        }
    }

    private suspend fun stopWatching(message: StopWatching) {
        requireConnected()
        val gameId = UUID.fromString(message.gameId)
        if (bridge.stopWatching(gameId)) {
            ack(message, "stopped watching $gameId")
        } else {
            fail(message, "not connected")
        }
    }

    private fun deckOwner(): String? {
        val current = account
        if (current == null && identity.requiresAccount) {
            throw AuthFailure(FailureCodes.AUTH_REQUIRED, "sign in to use decks on this bridge")
        }
        return current?.id
    }

    private suspend fun importDeck(message: ImportDeck) {
        val owner = deckOwner()
        require(message.text.length <= MAX_DECKLIST_CHARS) {
            "decklist is ${message.text.length} characters; the limit is $MAX_DECKLIST_CHARS"
        }

        val report = DeckImport.import(message.text, message.name, commanderOverride = message.commanders)
        val saved = if (message.preview) null else report.deck?.let { bridge.deckStore.save(owner, it) }
        val entries = if (message.preview) report.deck?.let(::entries).orEmpty() else emptyList()
        bridge.send(
            DeckImported(
                ok = if (message.preview) report.ok else saved != null,
                name = report.name,
                deck = saved?.let(::summary),
                cardCount = report.cardCount,
                commanders = report.commanders,
                notes = report.notes.map(::note),
                entries = entries,
            )
        )

        if (message.preview) {
            if (report.ok) ack(message, "${report.name}: ${report.cardCount} cards")
            else fail(message, previewFailureMessage(report))
        } else if (saved != null) {
            ack(message, "${saved.name}: ${saved.cardCount} cards, saved as ${saved.id}")
        } else {
            fail(message, previewFailureMessage(report))
        }
    }

    private fun previewFailureMessage(report: DeckImport.Report): String =
        "could not import: ${report.problems.size} problem(s), first: " +
            (report.problems.firstOrNull()?.describe() ?: "unknown")

    private suspend fun listDecks(message: ListDecks) {
        val decks = bridge.deckStore.list(deckOwner())
        val builtIn = bridge.deckPool.catalog
        bridge.send(Decks(decks.map(::summary), builtIn.map(::summary)))
        ack(message, "${decks.size} deck(s), ${builtIn.size} built-in")
    }

    private suspend fun deleteDeck(message: DeleteDeck) {
        val owner = deckOwner()
        val deleted = bridge.deckStore.delete(owner, message.deckId)
        bridge.send(Decks(bridge.deckStore.list(owner).map(::summary), bridge.deckPool.catalog.map(::summary)))
        if (deleted) ack(message, "deleted ${message.deckId}") else fail(message, "no deck '${message.deckId}'")
    }

    private suspend fun viewDeck(message: ViewDeck) {
        val owner = deckOwner()
        val file = bridge.deckStore.find(owner, message.deckId)?.file ?: bridge.deckPool.find(message.deckId)
        if (file == null) {
            fail(message, "no deck '${message.deckId}'")
            return
        }

        val deck = DeckFile.read(file)
        val cards = deck.cards.map { entry(it, commander = false) } +
            deck.sideboard.map { entry(it, commander = true) }
        bridge.send(
            DeckDetail(
                deckId = message.deckId,
                name = deck.name ?: message.deckId,
                cardCount = DeckFile.cardCount(deck),
                cards = cards,
            )
        )
        ack(message, "${deck.name}: ${cards.size} line(s)")
    }

    private fun entry(card: mage.cards.decks.DeckCardInfo, commander: Boolean): DeckCardEntry {
        val printing = CardIndex.Printing(card.setCode, card.cardNumber)
        val known = CardIndex.bundled.resolve(card.cardName, printing).cardOrNull()
        return DeckCardEntry(
            name = card.cardName,
            amount = card.amount,
            setCode = card.setCode,
            cardNumber = card.cardNumber,
            category = CardIndex.TypeCategory.nameOf(known?.category ?: CardIndex.TypeCategory.OTHER),
            colors = known?.colors.orEmpty().map(Char::toString),
            manaCost = known?.manaCost.orEmpty(),
            commander = commander,
            partnerTag = known?.partner?.label,
        )
    }

    private fun deckSummary(deck: mage.cards.decks.DeckCardLists) = DeckSummary(
        deckId = "",
        name = deck.name ?: "",
        cardCount = DeckFile.cardCount(deck),
        commanders = deck.sideboard.map { card ->
            val printing = CardIndex.Printing(card.setCode, card.cardNumber)
            val known = CardIndex.bundled.resolve(card.cardName, printing).cardOrNull()
            DeckCommander(
                name = card.cardName,
                setCode = card.setCode,
                cardNumber = card.cardNumber,
                colors = known?.colors.orEmpty().map(Char::toString),
            )
        },
    )

    private fun summary(deck: DeckStore.Saved) = DeckSummary(
        deckId = deck.id,
        name = deck.name,
        cardCount = deck.cardCount,
        commanders = deck.commanders.map(::commander),
        savedAt = deck.savedAt,
    )

    private fun commander(commander: DeckStore.Saved.Commander) = DeckCommander(
        name = commander.name,
        setCode = commander.printing.setCode,
        cardNumber = commander.printing.cardNumber,
        colors = CardIndex.bundled.resolve(commander.name, commander.printing).cardOrNull()
            ?.colors.orEmpty().map(Char::toString),
    )

    private fun note(note: DeckImport.Note) = DeckNote(
        level = when (note.level) {
            DeckImport.Level.ERROR -> DeckNoteLevel.ERROR
            DeckImport.Level.WARNING -> DeckNoteLevel.WARNING
        },
        message = note.message,
        lineNumber = note.lineNumber,
        text = note.text,
    )

    private fun DeckImport.Note.describe(): String =
        lineNumber?.let { "line $it: $message" } ?: message

    private fun entries(deck: mage.cards.decks.DeckCardLists): List<DeckCardEntry> =
        deck.cards.map { entry(it, commander = false) } + deck.sideboard.map { entry(it, commander = true) }

    private suspend fun gameAction(message: GameAction) {
        requireConnected()
        val action = message.actionType
        val gameId = UUID.fromString(message.gameId)
        val kind = bridge.promptKind(gameId)

        if (action !in PromptRules.promptIndependentActions && !PromptRules.isLegal(kind, action)) {
            val expects = PromptRules.expects(kind)
            fail(
                message,
                "'$action' cannot answer the current prompt ($kind); " +
                    if (expects.isEmpty()) {
                        "no prompt is outstanding, so no game action is legal " +
                            "(a spectator never receives a prompt)"
                    } else {
                        "expected one of $expects"
                    },
            )
            return
        }

        val sent = when (message) {

            is Activate -> bridge.sendPlayerUUID(gameId, UUID.fromString(message.objectId))
            is ChooseTarget -> bridge.sendPlayerUUID(gameId, UUID.fromString(message.targetId))
            is ChooseAbility -> bridge.sendPlayerUUID(gameId, UUID.fromString(message.abilityId))

            is Answer -> bridge.sendPlayerBoolean(gameId, message.yes)
            is PassPriority -> bridge.sendPlayerBoolean(gameId, false)
            is Cancel -> bridge.sendPlayerBoolean(gameId, false)

            is SetAmount -> bridge.sendPlayerInteger(gameId, message.amount)

            is SetAmounts -> bridge.sendPlayerString(gameId, message.amounts.joinToString(" "))
            is ChooseValue -> bridge.sendPlayerString(gameId, message.value)

            is PayManaFromPool -> {
                val playerId = message.playerId?.let(UUID::fromString)
                    ?: bridge.myPlayerId(gameId)
                    ?: throw IllegalStateException("unknown player id for game $gameId")
                bridge.sendPlayerManaType(gameId, playerId, parseManaType(message.manaType))
            }

            is Special -> bridge.sendPlayerString(gameId, "special")

            is PlayerActionMsg ->
                bridge.sendPlayerAction(parsePlayerAction(message.action), gameId, message.data)

            is Concede -> bridge.quitMatch(gameId)
        }

        if (sent) ack(message, "sent at prompt $kind") else fail(message, "server rejected the action")
    }

    private fun requireConnected() {
        check(bridge.isConnected) { "not logged in; send {\"type\":\"login\"} first" }
    }

    private fun ack(message: ClientMessage, detail: String? = null) {
        bridge.send(Ack(requestId = message.requestId, action = message.actionType, detail = detail))
    }

    private fun fail(
        message: ClientMessage,
        reason: String,
        code: String? = null,
        activeGame: Boolean? = null,
    ) {
        bridge.send(
            Failure(
                requestId = message.requestId,
                action = message.actionType,
                reason = reason,
                code = code,
                activeGame = activeGame,
            )
        )
    }

    private fun parsePlayerType(name: String): PlayerType =
        enumValueOrNull<PlayerType>(name)
            ?: throw IllegalArgumentException(
                "unknown playerType '$name'; expected one of ${PlayerType.values().map { it.name }}"
            )

    private fun parseManaType(name: String): ManaType =
        enumValueOrNull<ManaType>(name)
            ?: throw IllegalArgumentException(
                "unknown manaType '$name'; expected one of ${ManaType.values().map { it.name }}"
            )

    private fun parsePlayerAction(name: String): PlayerAction =
        enumValueOrNull<PlayerAction>(name)
            ?: throw IllegalArgumentException(
                "unknown playerAction '$name'; see mage.constants.PlayerAction"
            )
}

private inline fun <reified E : Enum<E>> enumValueOrNull(name: String): E? =
    enumValues<E>().firstOrNull { it.name.equals(name, ignoreCase = true) }
