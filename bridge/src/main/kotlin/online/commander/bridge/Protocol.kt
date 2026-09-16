package online.commander.bridge

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

const val PROTOCOL_VERSION = 1

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("type")
sealed interface ServerMessage

@Serializable
@SerialName("hello")
data class Hello(
    val protocolVersion: Int = PROTOCOL_VERSION,
    val bridgeSessionId: String,
    val xmageServerHost: String,
    val xmageServerPort: Int,

    val authMode: String = "off",

    val googleClientId: String? = null,
) : ServerMessage

@Serializable
@SerialName("loggedIn")
data class LoggedIn(
    val userName: String,
    val serverVersion: String,
    val mainRoomId: String,

    val sessionToken: String? = null,
    val displayName: String? = null,
    val email: String? = null,
    val accountId: String? = null,

    val playerName: String? = null,
) : ServerMessage

@Serializable
@SerialName("disconnected")
data class DisconnectedMsg(
    val askToReconnect: Boolean,
    val keepSessionActive: Boolean,
) : ServerMessage

@Serializable
@SerialName("notice")
data class Notice(
    val level: NoticeLevel,
    val text: String,
    val title: String? = null,
    val gameId: String? = null,
) : ServerMessage

@Serializable
enum class NoticeLevel { INFO, ERROR }

@Serializable
@SerialName("tables")
data class Tables(
    val roomId: String,
    val tables: List<TableSummary>,
) : ServerMessage

@Serializable
data class TableSummary(
    val tableId: String,
    val name: String,
    val controllerName: String,
    val gameType: String,
    val deckType: String,

    val state: String,

    val stateCode: String,
    val seatsInfo: String,
    val isTournament: Boolean,
    val passworded: Boolean,
    val seats: List<SeatSummary>,
    val gameIds: List<String>,
)

@Serializable
data class SeatSummary(
    val playerId: String?,
    val playerName: String?,
    val playerType: String,

    val deck: DeckSummary? = null,
)

@Serializable
@SerialName("tableCreated")
data class TableCreated(
    val roomId: String,
    val tableId: String,
    val gameType: String,
    val deckType: String,
    val seats: List<SeatSummary>,
) : ServerMessage

@Serializable
@SerialName("tableJoined")
data class TableJoined(
    val roomId: String,
    val tableId: String,
    val isTournament: Boolean,
) : ServerMessage

@Serializable
@SerialName("matchStarting")
data class MatchStarting(
    val roomId: String,
    val tableId: String,
) : ServerMessage

@Serializable
@SerialName("gameStarted")
data class GameStarted(
    val gameId: String,
    val tableId: String?,

    val myPlayerId: String?,
    val role: GameRole = GameRole.PLAYER,
) : ServerMessage

@Serializable
enum class GameRole {
    @SerialName("player")
    PLAYER,

    @SerialName("spectator")
    SPECTATOR,
}

@Serializable
@SerialName("gameState")
data class GameStateMsg(
    val gameId: String,

    val reason: String,
    val message: String? = null,
    val game: GameStateView,
) : ServerMessage

@Serializable
@SerialName("prompt")
data class PromptMsg(
    val gameId: String,
    val prompt: PromptView,
    val game: GameStateView? = null,
) : ServerMessage

@Serializable
@SerialName("gameOver")
data class GameOver(
    val gameId: String,
    val text: String? = null,
    val game: GameStateView? = null,
) : ServerMessage

@Serializable
@SerialName("matchOver")
data class MatchOver(
    val gameId: String,
    val gameInfo: String? = null,
    val matchInfo: String? = null,
    val additionalInfo: String? = null,
    val wins: Int = 0,
    val losses: Int = 0,
    val winsNeeded: Int = 0,
) : ServerMessage

@Serializable
@SerialName("chat")
data class Chat(
    val objectId: String,
    val from: String? = null,
    val text: String,
    val turnInfo: String? = null,
    val messageType: String? = null,
) : ServerMessage

@Serializable
@SerialName("ack")
data class Ack(
    val requestId: String? = null,
    val action: String,
    val detail: String? = null,
) : ServerMessage

@Serializable
@SerialName("failure")
data class Failure(
    val requestId: String? = null,
    val action: String? = null,
    val reason: String,

    val code: String? = null,

    val activeGame: Boolean? = null,
) : ServerMessage

object FailureCodes {
    const val AUTH_REQUIRED = "authRequired"
    const val AUTH_REJECTED = "authRejected"
    const val AUTH_EXPIRED = "authExpired"
    const val SESSION_TAKEN_OVER = "sessionTakenOver"
    const val SESSION_IN_USE = "sessionInUse"
}

@Serializable
data class DeckSummary(
    val deckId: String,
    val name: String,
    val cardCount: Int,

    val commanders: List<DeckCommander> = emptyList(),
    val savedAt: Long = 0,
)

@Serializable
data class DeckCommander(
    val name: String,
    val setCode: String,
    val cardNumber: String,
    val colors: List<String> = emptyList(),
)

@Serializable
@SerialName("deckImported")
data class DeckImported(
    val ok: Boolean,
    val name: String,
    val deck: DeckSummary? = null,
    val cardCount: Int = 0,
    val commanders: List<String> = emptyList(),
    val notes: List<DeckNote> = emptyList(),

    val entries: List<DeckCardEntry> = emptyList(),
) : ServerMessage

@Serializable
data class DeckNote(
    val level: DeckNoteLevel,
    val message: String,
    val lineNumber: Int? = null,
    val text: String? = null,
)

@Serializable
enum class DeckNoteLevel {
    ERROR,
    WARNING,
}

@Serializable
@SerialName("decks")
data class Decks(
    val decks: List<DeckSummary>,

    val builtIn: List<DeckSummary> = emptyList(),
) : ServerMessage

@Serializable
@SerialName("deckDetail")
data class DeckDetail(
    val deckId: String,
    val name: String,
    val cardCount: Int,
    val cards: List<DeckCardEntry>,
) : ServerMessage

@Serializable
data class DeckCardEntry(
    val name: String,
    val amount: Int,
    val setCode: String,
    val cardNumber: String,
    val category: String,
    val colors: List<String> = emptyList(),
    val manaCost: String = "",

    val commander: Boolean = false,

    val partnerTag: String? = null,
)

@Serializable
@SerialName("unmapped")
data class Unmapped(
    val callbackMethod: String,
    val objectId: String? = null,
    val payloadClass: String? = null,
) : ServerMessage

@Serializable
data class GameStateView(
    val turn: Int,
    val phase: String? = null,
    val step: String? = null,
    val activePlayerId: String? = null,
    val activePlayerName: String? = null,
    val priorityPlayerName: String? = null,
    val myPlayerId: String? = null,
    val isPlayer: Boolean,
    val specialActionAvailable: Boolean,
    val players: List<PlayerStateView>,
    val myHand: List<CardView>,
    val stack: List<CardView>,
    val combat: List<CombatGroupStateView>,

    val playable: List<PlayableObjectView>,

    val lookedAt: List<LookedAtWindowView> = emptyList(),

    val revealed: List<RevealedWindowView> = emptyList(),
)

@Serializable
data class LookedAtWindowView(
    val name: String,
    val cards: List<CardView>,
)

@Serializable
data class RevealedWindowView(
    val name: String,
    val cards: List<CardView>,
)

@Serializable
data class PlayableObjectView(
    val objectId: String,
    val playableAbilityCount: Int,

    val playableImportantCount: Int = 0,

    val abilityTexts: List<String> = emptyList(),

    val abilityIds: List<String> = emptyList(),
)

@Serializable
data class PlayerStateView(
    val playerId: String,
    val name: String,
    val life: Int,
    val isMe: Boolean,
    val isHuman: Boolean,
    val isActive: Boolean,
    val hasPriority: Boolean,
    val hasLeft: Boolean,
    val libraryCount: Int,
    val handCount: Int,
    val wins: Int,
    val winsNeeded: Int,
    val manaPool: ManaPoolStateView,
    val battlefield: List<PermanentStateView>,
    val graveyard: List<CardView>,
    val exile: List<CardView>,

    val commandZone: List<CommandObjectStateView>,
    val counters: List<CounterStateView>,
    val designations: List<String>,
    val monarch: Boolean,
    val initiative: Boolean,

    val topCard: CardView? = null,

    val playmatId: String? = null,
)

@Serializable
data class ManaPoolStateView(
    val white: Int,
    val blue: Int,
    val black: Int,
    val red: Int,
    val green: Int,
    val colorless: Int,
)

@Serializable
data class PermanentStateView(
    val card: CardView,
    val tapped: Boolean,
    val flipped: Boolean,
    val phasedIn: Boolean,
    val isCopy: Boolean,
    val damage: Int,
    val controllerName: String? = null,
    val attachedTo: String? = null,
    val attachments: List<String> = emptyList(),

    val canAttack: Boolean = false,

    val canBlock: Boolean = false,
)

@Serializable
data class CommandObjectStateView(
    val objectId: String,
    val name: String,
    val rules: List<String> = emptyList(),

    val card: CardView? = null,
)

@Serializable
data class CounterStateView(
    val name: String,
    val count: Int,
)

@Serializable
data class CardView(
    val objectId: String,
    val name: String,
    val displayName: String? = null,
    val manaCost: String? = null,
    val manaValue: Int? = null,
    val typeLine: String? = null,
    val power: String? = null,
    val toughness: String? = null,
    val loyalty: String? = null,
    val rules: List<String> = emptyList(),
    val setCode: String? = null,
    val cardNumber: String? = null,
    val imageFileName: String? = null,

    val imageNumber: Int? = null,

    val rarity: String? = null,

    val colors: List<String> = emptyList(),

    val frameColor: String? = null,

    val icons: List<CardIconView> = emptyList(),
    val faceDown: Boolean = false,
    val isToken: Boolean = false,
    val counters: List<CounterStateView> = emptyList(),

    val parentId: String? = null,
    val targets: List<String> = emptyList(),

    val isAbility: Boolean = false,
)

@Serializable
data class CardIconView(
    val type: String,
    val text: String = "",
    val hint: String = "",
)

@Serializable
data class CombatGroupStateView(
    val defenderId: String? = null,
    val defenderName: String? = null,
    val blocked: Boolean,
    val attackers: List<CardView>,
    val blockers: List<CardView>,
)

@Serializable
enum class PromptKind {
    NONE,
    GAME_SELECT,
    GAME_ASK,
    GAME_TARGET,
    GAME_CHOOSE_ABILITY,
    GAME_CHOOSE_PILE,
    GAME_CHOOSE_CHOICE,
    GAME_PLAY_MANA,
    GAME_PLAY_XMANA,
    GAME_GET_AMOUNT,
    GAME_GET_MULTI_AMOUNT,
}

@Serializable
enum class CombatStep {
    DECLARE_ATTACKERS,
    DECLARE_BLOCKERS,
}

@Serializable
data class PromptView(
    val kind: PromptKind,
    val message: String? = null,

    val secondMessage: String? = null,

    val required: Boolean = false,
    val min: Int? = null,
    val max: Int? = null,
    val okButtonText: String? = null,
    val cancelButtonText: String? = null,

    val cards: List<CardView> = emptyList(),

    val cards2: List<CardView> = emptyList(),

    val selectableTargets: List<String> = emptyList(),

    val chosenTargets: List<String> = emptyList(),
    val targetZone: String? = null,

    val combatStep: CombatStep? = null,

    val possibleAttackers: List<String> = emptyList(),

    val possibleBlockers: List<String> = emptyList(),

    val specialButtonText: String? = null,

    val choices: List<PromptChoice> = emptyList(),

    val amounts: List<AmountRequest> = emptyList(),

    val expects: List<String>,
)

@Serializable
data class PromptChoice(
    val key: String,
    val label: String,
)

@Serializable
data class AmountRequest(
    val message: String,
    val min: Int,
    val max: Int,
    val defaultValue: Int,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("type")
sealed interface ClientMessage {

    val requestId: String?
}

@Serializable
@SerialName("login")
data class Login(
    val userName: String? = null,
    val password: String = "",

    val googleToken: String? = null,

    val sessionToken: String? = null,

    val force: Boolean = false,
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("setPlayerName")
data class SetPlayerName(
    val playerName: String,
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("signOut")
data class SignOut(
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("listTables")
data class ListTables(
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("createTable")
data class CreateTable(
    val name: String? = null,
    val gameType: String? = null,
    val deckType: String? = null,
    val players: Int = 2,

    val aiOpponents: Int = 1,
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("joinTable")
data class JoinTable(
    val tableId: String,
    val seatName: String? = null,

    val playerType: String? = null,

    val deckId: String? = null,

    val deckFile: String? = null,

    val playmatId: String? = null,
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("startMatch")
data class StartMatch(
    val tableId: String,
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("leaveTable")
data class LeaveTable(
    val tableId: String,
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("quickGame")
data class QuickGame(
    val gameType: String? = null,
    val deckType: String? = null,
    val aiOpponents: Int = 1,

    val deckId: String? = null,

    val deckFile: String? = null,
    val playmatId: String? = null,
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("importDeck")
data class ImportDeck(
    val text: String,

    val name: String? = null,

    val commanders: List<String>? = null,

    val preview: Boolean = false,
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("listDecks")
data class ListDecks(
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("deleteDeck")
data class DeleteDeck(
    val deckId: String,
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("viewDeck")
data class ViewDeck(
    val deckId: String,
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("watchTable")
data class WatchTable(
    val tableId: String,
    val roomId: String? = null,
    override val requestId: String? = null,
) : ClientMessage

@Serializable
@SerialName("stopWatching")
data class StopWatching(
    val gameId: String,
    override val requestId: String? = null,
) : ClientMessage

@Serializable
data class SkipPrioritySteps(
    val upkeep: Boolean = false,
    val draw: Boolean = false,
    val main1: Boolean = true,
    val beforeCombat: Boolean = false,
    val endOfCombat: Boolean = false,
    val main2: Boolean = true,
    val endOfTurn: Boolean = false,
)

@Serializable
@SerialName("setSkipPrioritySteps")
data class SetSkipPrioritySteps(
    val yourTurn: SkipPrioritySteps = SkipPrioritySteps(),
    val opponentTurn: SkipPrioritySteps = SkipPrioritySteps(),
    val stopOnDeclareAttackers: Boolean = true,
    val stopOnDeclareBlockersWithZeroPermanents: Boolean = false,
    val stopOnDeclareBlockersWithAnyPermanents: Boolean = true,
    val stopOnAllMainPhases: Boolean = true,
    val stopOnAllEndPhases: Boolean = true,

    val stopOnStackNewObjects: Boolean = true,

    val passPriorityCast: Boolean = false,
    val passPriorityActivation: Boolean = false,
    override val requestId: String? = null,
) : ClientMessage

sealed interface GameAction : ClientMessage {
    val gameId: String
}

@Serializable
@SerialName("activate")
data class Activate(
    override val gameId: String,
    val objectId: String,
    override val requestId: String? = null,
) : GameAction

@Serializable
@SerialName("chooseTarget")
data class ChooseTarget(
    override val gameId: String,
    val targetId: String,
    override val requestId: String? = null,
) : GameAction

@Serializable
@SerialName("chooseAbility")
data class ChooseAbility(
    override val gameId: String,
    val abilityId: String,
    override val requestId: String? = null,
) : GameAction

@Serializable
@SerialName("answer")
data class Answer(
    override val gameId: String,
    val yes: Boolean,
    override val requestId: String? = null,
) : GameAction

@Serializable
@SerialName("passPriority")
data class PassPriority(
    override val gameId: String,
    override val requestId: String? = null,
) : GameAction

@Serializable
@SerialName("cancel")
data class Cancel(
    override val gameId: String,
    override val requestId: String? = null,
) : GameAction

@Serializable
@SerialName("setAmount")
data class SetAmount(
    override val gameId: String,
    val amount: Int,
    override val requestId: String? = null,
) : GameAction

@Serializable
@SerialName("setAmounts")
data class SetAmounts(
    override val gameId: String,
    val amounts: List<Int>,
    override val requestId: String? = null,
) : GameAction

@Serializable
@SerialName("chooseValue")
data class ChooseValue(
    override val gameId: String,

    val value: String,
    override val requestId: String? = null,
) : GameAction

@Serializable
@SerialName("payManaFromPool")
data class PayManaFromPool(
    override val gameId: String,

    val manaType: String,

    val playerId: String? = null,
    override val requestId: String? = null,
) : GameAction

@Serializable
@SerialName("special")
data class Special(
    override val gameId: String,
    override val requestId: String? = null,
) : GameAction

@Serializable
@SerialName("playerAction")
data class PlayerActionMsg(
    override val gameId: String,
    val action: String,
    val data: String? = null,
    override val requestId: String? = null,
) : GameAction

@Serializable
@SerialName("concede")
data class Concede(
    override val gameId: String,
    override val requestId: String? = null,
) : GameAction
