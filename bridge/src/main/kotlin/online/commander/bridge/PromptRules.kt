package online.commander.bridge

// XMage waits for a specific response type; an incorrect sender can leave the game waiting indefinitely.
object PromptRules {

    const val ACTIVATE = "activate"
    const val CHOOSE_TARGET = "chooseTarget"
    const val CHOOSE_ABILITY = "chooseAbility"
    const val ANSWER = "answer"
    const val PASS_PRIORITY = "passPriority"
    const val CANCEL = "cancel"
    const val SET_AMOUNT = "setAmount"
    const val SET_AMOUNTS = "setAmounts"
    const val CHOOSE_VALUE = "chooseValue"
    const val PAY_MANA_FROM_POOL = "payManaFromPool"
    const val SPECIAL = "special"
    const val PLAYER_ACTION = "playerAction"
    const val CONCEDE = "concede"

    private val legalActions: Map<PromptKind, Set<String>> = mapOf(
        PromptKind.NONE to emptySet(),
        PromptKind.GAME_SELECT to setOf(ACTIVATE, PASS_PRIORITY, SPECIAL),
        PromptKind.GAME_ASK to setOf(ANSWER),
        PromptKind.GAME_TARGET to setOf(CHOOSE_TARGET, CANCEL),
        PromptKind.GAME_CHOOSE_ABILITY to setOf(CHOOSE_ABILITY, CANCEL),
        PromptKind.GAME_CHOOSE_PILE to setOf(ANSWER),
        PromptKind.GAME_CHOOSE_CHOICE to setOf(CHOOSE_VALUE),
        PromptKind.GAME_PLAY_MANA to setOf(ACTIVATE, PAY_MANA_FROM_POOL, SPECIAL, CANCEL),
        PromptKind.GAME_PLAY_XMANA to setOf(SET_AMOUNT, CANCEL),
        PromptKind.GAME_GET_AMOUNT to setOf(SET_AMOUNT, CANCEL),
        PromptKind.GAME_GET_MULTI_AMOUNT to setOf(SET_AMOUNTS, CANCEL),
    )

    fun expects(kind: PromptKind): List<String> =
        (legalActions[kind] ?: emptySet()).sorted()

    fun isLegal(kind: PromptKind, actionType: String): Boolean =
        actionType in (legalActions[kind] ?: emptySet())

    val promptIndependentActions: Set<String> = setOf(PLAYER_ACTION, CONCEDE)
}

val ClientMessage.actionType: String
    get() = when (this) {
        is Login -> "login"
        is ListTables -> "listTables"
        is CreateTable -> "createTable"
        is JoinTable -> "joinTable"
        is StartMatch -> "startMatch"
        is LeaveTable -> "leaveTable"
        is QuickGame -> "quickGame"
        is WatchTable -> "watchTable"
        is StopWatching -> "stopWatching"
        is SetSkipPrioritySteps -> "setSkipPrioritySteps"
        is ImportDeck -> "importDeck"
        is ListDecks -> "listDecks"
        is DeleteDeck -> "deleteDeck"
        is ViewDeck -> "viewDeck"
        is SetPlayerName -> "setPlayerName"
        is SignOut -> "signOut"
        is Activate -> PromptRules.ACTIVATE
        is ChooseTarget -> PromptRules.CHOOSE_TARGET
        is ChooseAbility -> PromptRules.CHOOSE_ABILITY
        is Answer -> PromptRules.ANSWER
        is PassPriority -> PromptRules.PASS_PRIORITY
        is Cancel -> PromptRules.CANCEL
        is SetAmount -> PromptRules.SET_AMOUNT
        is SetAmounts -> PromptRules.SET_AMOUNTS
        is ChooseValue -> PromptRules.CHOOSE_VALUE
        is PayManaFromPool -> PromptRules.PAY_MANA_FROM_POOL
        is Special -> PromptRules.SPECIAL
        is PlayerActionMsg -> PromptRules.PLAYER_ACTION
        is Concede -> PromptRules.CONCEDE
    }
