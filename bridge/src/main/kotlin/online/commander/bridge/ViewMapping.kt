package online.commander.bridge

import mage.ObjectColor
import mage.abilities.icon.CardIcon
import mage.choices.Choice
import mage.util.MultiAmountMessage
import mage.view.AbilityPickerView
import mage.view.AbilityView
import mage.view.CardsView
import mage.view.CombatGroupView
import mage.view.CommandObjectView
import mage.view.GameClientMessage
import mage.view.GameView
import mage.view.PermanentView
import mage.view.PlayerView
import mage.view.SimpleCardView
import mage.view.StackAbilityView
import mage.view.TableView
import java.io.Serializable
import java.util.UUID
import mage.view.CardView as MageCardView

object ViewMapping {

    fun myPlayerId(view: GameView): UUID? = view.myPlayer?.playerId

    fun gameState(
        view: GameView,
        playmats: Map<String, String> = emptyMap(),
        names: Map<String, String> = emptyMap(),
    ): GameStateView = GameStateView(
        turn = view.turn,
        phase = view.phase?.toString(),
        step = view.step?.toString(),
        activePlayerId = view.activePlayerId?.toString(),
        activePlayerName = view.activePlayerName.orNullIfBlank()?.let { names[it] ?: it },
        priorityPlayerName = view.priorityPlayerName.orNullIfBlank()?.let { names[it] ?: it },
        myPlayerId = myPlayerId(view)?.toString(),
        isPlayer = view.isPlayer,
        specialActionAvailable = view.special,
        players = view.players.orEmpty().map { player(it, myPlayerId(view), playmats, names) },
        myHand = cards(view.myHand, names),
        stack = cards(view.stack, names),
        combat = view.combat.orEmpty().map { combatGroup(it, names) },
        playable = view.canPlayObjects?.objects.orEmpty().map { (id, stats) ->
            PlayableObjectView(
                objectId = id.toString(),
                playableAbilityCount = stats?.playableAmount ?: 0,
                playableImportantCount = stats?.playableImportantAmount ?: 0,
                abilityTexts = stats?.playableAbilityNames.orEmpty().filterNotNull(),
                abilityIds = stats?.playableAbilityIds.orEmpty().filterNotNull().map(UUID::toString),
            )
        },

        lookedAt = view.lookedAt.orEmpty().filterNotNull().mapNotNull { window ->
            val cards = window.cards.orEmpty().values.filterNotNull().map(::simpleCard)
            if (cards.isEmpty()) null else LookedAtWindowView(name = window.name ?: "", cards = cards)
        },

        revealed = view.revealed.orEmpty().filterNotNull().mapNotNull { window ->
            val cards = cards(window.cards)
            if (cards.isEmpty()) null else RevealedWindowView(name = window.name ?: "", cards = cards)
        },
    )

    fun simpleCard(view: SimpleCardView): CardView {
        val setCode = view.expansionSetCode.orNullIfBlank()
        val cardNumber = view.cardNumber.orNullIfBlank()
        val printing = if (setCode != null && cardNumber != null) CardIndex.Printing(setCode, cardNumber) else null
        return CardView(
            objectId = view.id.toString(),
            name = printing?.let { CardIndex.bundled.nameOf(it) } ?: "",
            setCode = setCode,
            cardNumber = cardNumber,
        )
    }

    private fun player(
        view: PlayerView,
        myPlayerId: UUID?,
        playmats: Map<String, String> = emptyMap(),
        names: Map<String, String> = emptyMap(),
    ): PlayerStateView = PlayerStateView(
        playerId = view.playerId.toString(),
        name = view.name?.let { names[it] ?: it } ?: "",
        life = view.life,

        isMe = myPlayerId != null && myPlayerId == view.playerId,
        isHuman = view.isHuman,
        isActive = view.isActive,
        hasPriority = view.hasPriority(),
        hasLeft = view.hasLeft(),
        libraryCount = view.libraryCount,
        handCount = view.handCount,
        wins = view.wins,
        winsNeeded = view.winsNeeded,
        manaPool = view.manaPool.let {
            ManaPoolStateView(
                white = it?.white ?: 0,
                blue = it?.blue ?: 0,
                black = it?.black ?: 0,
                red = it?.red ?: 0,
                green = it?.green ?: 0,
                colorless = it?.colorless ?: 0,
            )
        },
        battlefield = view.battlefield.orEmpty().values.filterNotNull().map { permanent(it, names) },
        graveyard = cards(view.graveyard, names),
        exile = cards(view.exile, names),
        commandZone = view.commandObjectList.orEmpty().filterNotNull().map { commandObject(it, names) },
        counters = view.counters.orEmpty().filterNotNull().map {
            CounterStateView(name = it.name ?: "", count = it.count)
        },
        designations = view.designationNames.orEmpty().filterNotNull(),
        monarch = view.isMonarch,
        initiative = view.isInitiative,
        topCard = view.topCard?.let { card(it, names) },

        playmatId = view.name?.let(playmats::get),
    )

    private fun permanent(view: PermanentView, names: Map<String, String> = emptyMap()): PermanentStateView =
        PermanentStateView(
            card = card(view, names),
            tapped = view.isTapped,
            flipped = view.isFlipped,
            phasedIn = view.isPhasedIn,
            isCopy = view.isCopy,
            damage = view.damage,
            controllerName = view.nameController.orNullIfBlank()?.let { names[it] ?: it },
            attachedTo = view.attachedTo?.toString(),
            attachments = view.attachments.orEmpty().filterNotNull().map(UUID::toString),
            canAttack = view.isCanAttack,
            canBlock = view.isCanBlock,
        )

    private fun commandObject(view: CommandObjectView, names: Map<String, String> = emptyMap()): CommandObjectStateView =
        CommandObjectStateView(
            objectId = view.id?.toString() ?: "",
            name = view.name ?: "",

            rules = view.rules.orEmpty().filterNotNull().map { substituteNames(it, names) },

            card = (view as? MageCardView)?.let { card(it, names) },
        )

    private fun combatGroup(
        view: CombatGroupView,
        names: Map<String, String> = emptyMap(),
    ): CombatGroupStateView = CombatGroupStateView(
        defenderId = view.defenderId?.toString(),
        defenderName = view.defenderName.orNullIfBlank()?.let { names[it] ?: it },
        blocked = view.isBlocked,
        attackers = cards(view.attackers, names),
        blockers = cards(view.blockers, names),
    )

    fun cards(view: CardsView?, names: Map<String, String> = emptyMap()): List<CardView> =
        view.orEmpty().values.filterNotNull().map { card(it, names) }

    fun card(view: MageCardView, names: Map<String, String> = emptyMap()): CardView {
        val source = (view as? AbilityView)?.sourceCard
        val art = source ?: view
        val printing = (view as? StackAbilityView)?.sourceCard ?: art

        val named = if (source != null) view.name?.takeUnless { it == ABILITY_PLACEHOLDER_NAME } else null
        return CardView(
            objectId = view.id?.toString() ?: "",
            name = named ?: art.name ?: "",
            displayName = art.displayName.orNullIfBlank(),
            manaCost = art.manaCostStr.orNullIfBlank(),
            manaValue = art.manaValue,
            typeLine = art.typeText.orNullIfBlank(),
            power = art.power.orNullIfBlank(),
            toughness = art.toughness.orNullIfBlank(),
            loyalty = art.loyalty.orNullIfBlank(),

            rules = view.rules.orEmpty().filterNotNull().map { substituteNames(it, names) },
            setCode = printing.expansionSetCode.orNullIfBlank(),
            cardNumber = printing.cardNumber.orNullIfBlank(),
            imageFileName = printing.imageFileName.orNullIfBlank(),

            imageNumber = printing.imageNumber.takeIf { it > 0 },
            rarity = art.rarity?.name,
            colors = colorLetters(art.color),
            frameColor = art.frameColor?.toString().orNullIfBlank(),
            icons = art.cardIcons.orEmpty().filterNotNull().map(::cardIcon),
            faceDown = art.isFaceDown,
            isToken = art.isToken,
            counters = art.counters.orEmpty().filterNotNull().map {
                CounterStateView(name = it.name ?: "", count = it.count)
            },
            parentId = art.parentId?.toString(),

            targets = view.targets.orEmpty().filterNotNull().map(UUID::toString),
            isAbility = source != null,
        )
    }

    fun colorLetters(color: ObjectColor?): List<String> =
        color?.toString().orEmpty().map(Char::toString)

    fun cardIcon(icon: CardIcon): CardIconView = CardIconView(
        type = icon.iconType?.name ?: "",
        text = icon.text ?: "",
        hint = icon.hint ?: "",
    )

    fun table(
        view: TableView,
        decks: Map<String, DeckSummary> = emptyMap(),
        names: Map<String, String> = emptyMap(),
    ): TableSummary = TableSummary(
        tableId = view.tableId?.toString() ?: "",

        name = view.tableName?.let { substituteNames(it, names) } ?: "",

        controllerName = view.controllerName?.substringBefore(", ")?.let { names[it] ?: it } ?: "",
        gameType = view.gameType ?: "",
        deckType = view.deckType ?: "",
        state = view.tableState?.toString() ?: "",
        stateCode = view.tableState?.name ?: "",
        seatsInfo = view.seatsInfo ?: "",
        isTournament = view.isTournament,
        passworded = view.isPassworded,
        seats = view.seats.orEmpty().filterNotNull().map {
            SeatSummary(
                playerId = it.playerId?.toString(),
                playerName = it.playerName.orNullIfBlank()?.let { seat -> names[seat] ?: seat },
                playerType = it.playerType?.name ?: "",
                deck = it.playerName?.let(decks::get),
            )
        },
        gameIds = view.games.orEmpty().filterNotNull().map(UUID::toString),
    )

    fun prompt(kind: PromptKind, message: GameClientMessage): PromptView {
        val options = message.options.orEmpty()
        val promptCards = cards(message.cardsView1)
        return PromptView(
            kind = kind,

            message = message.message.orNullIfBlank() ?: options[OPTION_HEADER] as? String,

            secondMessage = (options[OPTION_SECOND_MESSAGE] as? String).orNullIfBlank(),
            required = message.isFlag,
            min = message.min.takeIf { kindUsesRange(kind) },
            max = message.max.takeIf { kindUsesRange(kind) },
            okButtonText = options[OPTION_LEFT_BUTTON] as? String,
            cancelButtonText = options[OPTION_RIGHT_BUTTON] as? String,
            cards = promptCards,
            cards2 = cards(message.cardsView2),

            selectableTargets = message.targets?.filterNotNull()?.map(UUID::toString)
                ?: if (OPTION_POSSIBLE_TARGETS in options) {
                    uuidSet(options[OPTION_POSSIBLE_TARGETS])
                } else {
                    promptCards.map { it.objectId }
                },
            chosenTargets = uuidSet(options[OPTION_CHOSEN_TARGETS]),
            targetZone = options[OPTION_TARGET_ZONE]?.toString(),

            combatStep = when {
                OPTION_POSSIBLE_ATTACKERS in options -> CombatStep.DECLARE_ATTACKERS
                OPTION_POSSIBLE_BLOCKERS in options -> CombatStep.DECLARE_BLOCKERS
                else -> null
            },
            possibleAttackers = uuidSet(options[OPTION_POSSIBLE_ATTACKERS]),
            possibleBlockers = uuidSet(options[OPTION_POSSIBLE_BLOCKERS]),
            specialButtonText = options[OPTION_SPECIAL_BUTTON] as? String,
            choices = message.choice?.let(::choices).orEmpty(),
            amounts = message.messages.orEmpty().filterNotNull().map(::amountRequest),
            expects = PromptRules.expects(kind),
        )
    }

    fun abilityPrompt(view: AbilityPickerView): PromptView = PromptView(
        kind = PromptKind.GAME_CHOOSE_ABILITY,
        message = view.message.orNullIfBlank(),
        choices = view.choices.orEmpty().map { (id, text) ->
            PromptChoice(key = id.toString(), label = text ?: "")
        },
        expects = PromptRules.expects(PromptKind.GAME_CHOOSE_ABILITY),
    )

    private fun choices(choice: Choice): List<PromptChoice> =
        if (choice.isKeyChoice) {
            choice.keyChoices.orEmpty().map { (key, label) ->
                PromptChoice(key = key ?: "", label = label ?: "")
            }
        } else {
            choice.choices.orEmpty().filterNotNull().map { PromptChoice(key = it, label = it) }
        }

    private fun amountRequest(message: MultiAmountMessage): AmountRequest = AmountRequest(
        message = message.message ?: "",
        min = message.min,
        max = message.max,
        defaultValue = message.defaultValue,
    )

    private fun kindUsesRange(kind: PromptKind): Boolean = when (kind) {
        PromptKind.GAME_GET_AMOUNT,
        PromptKind.GAME_GET_MULTI_AMOUNT,
        PromptKind.GAME_PLAY_XMANA,
        -> true

        else -> false
    }

    private const val OPTION_LEFT_BUTTON = "UI.left.btn.text"
    private const val OPTION_RIGHT_BUTTON = "UI.right.btn.text"
    private const val OPTION_CHOSEN_TARGETS = "chosenTargets"
    private const val OPTION_TARGET_ZONE = "targetZone"
    private const val OPTION_POSSIBLE_TARGETS = "possibleTargets"
    private const val OPTION_HEADER = "header"
    private const val OPTION_SECOND_MESSAGE = "secondMessage"

    private const val OPTION_POSSIBLE_ATTACKERS = "possibleAttackers"
    private const val OPTION_POSSIBLE_BLOCKERS = "possibleBlockers"
    private const val OPTION_SPECIAL_BUTTON = "specialButton"

    private const val ABILITY_PLACEHOLDER_NAME = "Ability"

    private fun uuidSet(value: Any?): List<String> = when (value) {
        is Collection<*> -> value.filterNotNull().map(Any::toString)
        else -> emptyList()
    }

    fun substituteNames(text: String, names: Map<String, String>): String =
        names.entries.fold(text) { acc, (handle, name) ->
            if (handle == name) acc else acc.replace(Regex("\\b${Regex.escape(handle)}\\b"), name)
        }
}

private fun String?.orNullIfBlank(): String? = this?.takeIf { it.isNotBlank() }
