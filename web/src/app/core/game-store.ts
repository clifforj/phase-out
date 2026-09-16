import { Injectable, computed, inject, signal } from '@angular/core';
import { AUTO_PASS_GLANCE_MS, AUTO_PASS_UNCHANGED_MS, AutoPassScheduler } from './auto-pass';
import { AutoPayMana } from './auto-pay-mana';
import { TriggerOrderRunner } from './trigger-order-runner';
import { LoginFlow } from './login-flow';
import { AuthStore } from './auth-store';
import { BridgeClient } from './bridge-client';
import { DeckStore } from './deck-store';
import { DiagnosticsStore } from './diagnostics-store';
import { LobbyStore } from './lobby-store';
import { Preferences } from './preferences';
import {
  DEFAULT_SKIP_PRIORITY_SETTINGS,
  SkipPrioritySettings,
  readSkipPrioritySettings,
  writeSkipPrioritySettings,
} from './skip-priority-settings';
import { LogLine, appendLogLine, isLogMessage, toLogLine } from './game-log';
import { GLANCE_KINDS, gameEvent, gameEvents } from '../rules/game-events';
import { manaPaymentPlan, unpaidManaCostText } from '../rules/mana-payment';
import { RoundTrackerState, advanceRound, initialRoundTrackerState } from '../rules/round-tracker';
import {
  GameActionFrame,
  GameRole,
  GameStateView,
  ManaType,
  PromptView,
  SUPPORTED_PROTOCOL_VERSION,
  ServerFrame,
} from './protocol';

export { AUTO_PASS_GLANCE_MS, AUTO_PASS_UNCHANGED_MS };

export type WatchState = 'idle' | 'requesting' | 'watching' | 'refused' | 'over';

export const PASS_AHEAD_ACTIONS = {
  endOfTurn: 'PASS_PRIORITY_UNTIL_TURN_END_STEP',
  nextTurn: 'PASS_PRIORITY_UNTIL_MY_NEXT_TURN',
  cancel: 'PASS_PRIORITY_CANCEL_ALL_ACTIONS',
} as const;

export type ActiveSkip = 'endOfTurn' | 'nextTurn';

export interface GameResult {
  text?: string;
  matchInfo?: string;
  additionalInfo?: string;
}

export const LOG_LINE_LIMIT = 500;

@Injectable({ providedIn: 'root' })
export class GameStore {
  private readonly bridge = inject(BridgeClient);
  private readonly auth = inject(AuthStore);
  private readonly diagnostics = inject(DiagnosticsStore);
  private readonly lobby = inject(LobbyStore);
  private readonly deckStore = inject(DeckStore);
  private readonly prefs = inject(Preferences);

  readonly status = this.bridge.status;
  readonly reconnects = this.bridge.reconnects;
  readonly transportError = this.bridge.lastError;

  readonly protocolMismatch = signal<string | null>(null);

  readonly userName = signal<string | null>(null);

  readonly displayName = signal<string | null>(null);
  readonly serverVersion = signal<string | null>(null);
  readonly mainRoomId = signal<string | null>(null);
  readonly loggedIn = computed(() => this.userName() !== null);

  readonly myPlayerName = computed(() => this.auth.account()?.playerName ?? this.userName());

  readonly xmageDropped = signal(false);

  readonly rejoinPrompt = signal<string | null>(null);

  clearRejoinPrompt(): void {
    this.rejoinPrompt.set(null);
  }

  readonly tables = this.lobby.tables;
  readonly tablesFetchedAt = this.lobby.tablesFetchedAt;
  readonly tablesPending = this.lobby.tablesPending;

  readonly myTableId = this.lobby.myTableId;

  readonly skipPrioritySettings = signal<SkipPrioritySettings>(readSkipPrioritySettings());

  readonly gameId = signal<string | null>(null);
  readonly role = signal<GameRole | null>(null);
  readonly watchTableId = signal<string | null>(null);
  readonly watchState = signal<WatchState>('idle');
  readonly watchProblem = signal<string | null>(null);

  readonly myPlayerId = signal<string | null>(null);

  readonly snapshot = signal<GameStateView | null>(null);
  readonly prompt = signal<PromptView | null>(null);
  readonly result = signal<GameResult | null>(null);

  private readonly roundTracker = signal<RoundTrackerState>(initialRoundTrackerState);
  readonly round = computed(() => this.roundTracker().round);

  private readonly autoPass = new AutoPassScheduler({
    prompt: this.prompt,
    snapshot: this.snapshot,
    role: this.role,
    passPriority: () => this.passPriority(),
  });

  private readonly autoPayer = new AutoPayMana({
    prompt: this.prompt,
    snapshot: this.snapshot,
    chooseAbility: (abilityId) => this.chooseAbility(abilityId),
    chooseValue: (value) => this.chooseValue(value),
    payManaFromPool: (manaType) => this.payManaFromPool(manaType),
    activate: (objectId) => this.activate(objectId),
    toast: (level, text) => this.toast(level, text),
  });

  private readonly triggerOrderRunner = new TriggerOrderRunner({
    prompt: this.prompt,
    chooseTarget: (targetId) => this.chooseTarget(targetId),
    clearPrompt: () => this.prompt.set(null),
  });

  readonly autoPassMs = this.autoPass.autoPassMs;

  readonly autoPassing = this.autoPass.autoPassing;

  readonly autoPaying = this.autoPayer.autoPaying;

  readonly orderingTriggers = this.triggerOrderRunner.orderingTriggers;

  readonly manaPaymentPlan = computed(() => manaPaymentPlan(this.decision(), this.snapshot()));

  readonly unpaidManaCost = computed(() => unpaidManaCostText(this.decision()));

  readonly decision = computed(() => (this.autoPassing() ? null : this.prompt()));

  readonly activeSkip = signal<ActiveSkip | null>(null);

  readonly targetListOpen = signal(false);

  readonly choiceListOpen = signal(false);

  readonly log = signal<LogLine[]>([]);

  readonly events = computed(() => gameEvents(this.log()));

  readonly toasts = this.diagnostics.toasts;
  readonly unmapped = this.diagnostics.unmapped;
  readonly failures = this.diagnostics.failures;

  readonly hasGame = computed(() => this.snapshot() !== null);

  readonly playableIds = computed(
    () => new Set((this.snapshot()?.playable ?? []).map((p) => p.objectId)),
  );

  readonly needsAction = computed(() => this.role() === 'player' && this.decision() !== null);

  readonly mySeat = computed(() => this.snapshot()?.players.find((p) => p.isMe) ?? null);

  readonly eliminated = computed(
    () => this.role() === 'player' && !!this.mySeat()?.hasLeft && this.watchState() !== 'over',
  );

  private nextLogId = 1;
  private connected = false;

  private readonly lobbyActionSinceLogin = signal(false);

  private readonly loginFlow = new LoginFlow({
    send: (frame) => this.bridge.send(frame),
    auth: this.auth,
    userName: this.userName,
    displayName: this.displayName,
    serverVersion: this.serverVersion,
    mainRoomId: this.mainRoomId,
    xmageDropped: this.xmageDropped,
    lobbyActionSinceLogin: this.lobbyActionSinceLogin,
    toast: (level, text, title) => this.toast(level, text, title),
    halt: (reason) => this.bridge.halt(reason),
    onLoggedIn: () => this.onLoggedIn(),
  });

  private glanceEvents = 0;
  private glanceEventsAtLastPrompt = 0;

  connect(): void {
    if (this.connected) return;
    this.connected = true;
    this.bridge.connect({
      onFrame: (frame) => this.onFrame(frame),
      onOpen: () => this.loginFlow.onOpen(),
    });
  }

  confirmSessionTakeover(): void {
    this.loginFlow.confirmSessionTakeover();
  }

  declineSessionTakeover(): void {
    this.loginFlow.declineSessionTakeover();
  }

  retrySessionTakeover(): void {
    this.loginFlow.retrySessionTakeover();
  }

  loginWithGoogleToken(googleToken: string): void {
    this.loginFlow.loginWithGoogleToken(googleToken);
  }

  setPlayerName(playerName: string): void {
    this.loginFlow.setPlayerName(playerName);
  }

  signOut(): void {
    this.bridge.send({ type: 'signOut' });
    this.loginFlow.signOutIdentity();
    this.lobby.clearTables();
    this.deckStore.clearForSignOut();
    this.forgetGame();

    this.bridge.close();
    this.connected = false;
    this.connect();
  }

  refreshTables(): void {
    this.lobby.beginRefresh();
    if (!this.bridge.send({ type: 'listTables' })) this.lobby.cancelRefresh();
  }

  watch(tableId: string): void {
    this.lobbyActionSinceLogin.set(true);
    this.watchTableId.set(tableId);
    this.watchProblem.set(null);
    this.watchState.set('requesting');
    this.resetGame();
    if (this.loggedIn()) this.sendWatch(tableId);
  }

  stopWatching(): void {
    const gameId = this.gameId();
    if (gameId) this.bridge.send({ type: 'stopWatching', gameId });
    this.watchTableId.set(null);
    this.watchState.set('idle');
    this.resetGame();
  }

  createTable(
    opts: { players?: number; aiOpponents?: number; name?: string; gameType?: string } = {},
  ): void {
    this.lobbyActionSinceLogin.set(true);
    this.forgetGame();
    this.lobby.beginCreate();
    this.bridge.send({
      type: 'createTable',
      players: opts.players ?? 2,
      aiOpponents: opts.aiOpponents ?? 0,
      name: opts.name,
      gameType: opts.gameType,
    });
  }

  joinTable(tableId: string): void {
    this.lobbyActionSinceLogin.set(true);
    this.forgetGame();
    this.lobby.setMyTableId(tableId);
    this.bridge.send({
      type: 'joinTable',
      tableId,
      deckId: this.deckStore.selectedDeckId() ?? undefined,
      playmatId: this.prefs.playmatId() ?? undefined,
    });
  }

  startMatch(tableId: string): void {
    this.bridge.send({ type: 'startMatch', tableId });
  }

  leaveTable(tableId: string): void {
    this.bridge.send({ type: 'leaveTable', tableId });
    this.lobby.clearMyTableIdIfMatches(tableId);
  }

  quickGame(aiOpponents = 1, gameType?: string): void {
    this.lobbyActionSinceLogin.set(true);

    this.bridge.send({
      type: 'quickGame',
      aiOpponents,
      gameType,
      deckId: this.deckStore.selectedDeckId() ?? undefined,
      playmatId: this.prefs.playmatId() ?? undefined,
    });
  }

  setSkipPrioritySteps(settings: SkipPrioritySettings): void {
    this.skipPrioritySettings.set(settings);
    writeSkipPrioritySettings(settings);
    this.bridge.send({ type: 'setSkipPrioritySteps', ...settings });
  }

  private act(build: (gameId: string) => GameActionFrame): boolean {
    const gameId = this.gameId();
    if (!gameId) return false;

    this.autoPass.clear();
    const frame = build(gameId);
    this.bridge.send(frame);
    if (frame.type !== 'chooseTarget') this.prompt.set(null);
    return true;
  }

  activate(objectId: string): void {
    this.act((gameId) => ({ type: 'activate', gameId, objectId }));
  }

  chooseTarget(targetId: string): void {
    this.act((gameId) => ({ type: 'chooseTarget', gameId, targetId }));
  }

  chooseAbility(abilityId: string): void {
    this.act((gameId) => ({ type: 'chooseAbility', gameId, abilityId }));
  }

  answer(yes: boolean): void {
    this.act((gameId) => ({ type: 'answer', gameId, yes }));
  }

  passPriority(): void {
    this.act((gameId) => ({ type: 'passPriority', gameId }));
  }

  cancel(): void {
    this.act((gameId) => ({ type: 'cancel', gameId }));
  }

  setAmount(amount: number): void {
    this.act((gameId) => ({ type: 'setAmount', gameId, amount }));
  }

  setAmounts(amounts: number[]): void {
    this.act((gameId) => ({ type: 'setAmounts', gameId, amounts }));
  }

  chooseValue(value: string): void {
    this.act((gameId) => ({ type: 'chooseValue', gameId, value }));
  }

  payManaFromPool(manaType: ManaType): void {
    this.act((gameId) => ({ type: 'payManaFromPool', gameId, manaType }));
  }

  special(): void {
    this.act((gameId) => ({ type: 'special', gameId }));
  }

  concede(): void {
    this.act((gameId) => ({ type: 'concede', gameId }));
  }

  playerAction(action: string): void {
    if (!this.act((gameId) => ({ type: 'playerAction', gameId, action }))) return;
    if (action === PASS_AHEAD_ACTIONS.endOfTurn) this.activeSkip.set('endOfTurn');
    else if (action === PASS_AHEAD_ACTIONS.nextTurn) this.activeSkip.set('nextTurn');
    else if (action === PASS_AHEAD_ACTIONS.cancel) this.activeSkip.set(null);
  }

  dismissToast(id: number): void {
    this.diagnostics.dismissToast(id);
  }

  private sendWatch(tableId: string): void {
    this.bridge.send({ type: 'watchTable', tableId, requestId: `watch-${tableId}` });
  }

  private forgetGame(): void {
    this.watchTableId.set(null);
    this.watchState.set('idle');
    this.watchProblem.set(null);
    this.lobby.setMyTableId(null);
    this.resetGame();
  }

  private resetGame(): void {
    this.autoPass.clear();
    this.autoPayer.stop();
    this.triggerOrderRunner.stop();
    this.snapshot.set(null);
    this.prompt.set(null);
    this.result.set(null);
    this.gameId.set(null);
    this.role.set(null);
    this.log.set([]);
    this.activeSkip.set(null);
    this.glanceEvents = 0;
    this.glanceEventsAtLastPrompt = 0;
    this.roundTracker.set(initialRoundTrackerState);
  }

  private applyGameSnapshot(game: GameStateView): void {
    this.snapshot.set(game);
    const activePlayerId = game.players.find((player) => player.isActive)?.playerId ?? null;
    this.roundTracker.update((state) => advanceRound(state, game.turn, activePlayerId));
  }

  autoPayMana(): void {
    this.autoPayer.start();
  }

  orderTriggers(resolutionOrder: readonly string[]): void {
    this.triggerOrderRunner.order(resolutionOrder);
  }

  private onFrame(frame: ServerFrame): void {
    switch (frame.type) {
      case 'hello':
        this.onHelloFrame(frame);
        break;
      case 'loggedIn':
        this.onLoggedInFrame(frame);
        break;
      case 'tables':
        this.onTablesFrame(frame);
        break;
      case 'gameStarted':
        this.onGameStartedFrame(frame);
        break;
      case 'gameState':
        this.onGameStateFrame(frame);
        break;
      case 'prompt':
        this.onPromptFrame(frame);
        break;
      case 'chat':
        this.onChatFrame(frame);
        break;
      case 'gameOver':
        this.onGameOverFrame(frame);
        break;
      case 'matchOver':
        this.onMatchOverFrame(frame);
        break;
      case 'notice':
        this.onNoticeFrame(frame);
        break;
      case 'failure':
        this.onFailureFrame(frame);
        break;
      case 'unmapped':
        this.onUnmappedFrame(frame);
        break;
      case 'disconnected':
        this.onDisconnectedFrame();
        break;
      case 'tableCreated':
        this.onTableCreatedFrame(frame);
        break;
      case 'tableJoined':
        this.onTableJoinedFrame(frame);
        break;
      case 'matchStarting':
        this.onMatchStartingFrame();
        break;
      case 'deckImported':
        this.deckStore.onDeckImportedFrame(frame);
        break;
      case 'decks':
        this.deckStore.onDecksFrame(frame);
        break;
      case 'deckDetail':
        this.deckStore.onDeckDetailFrame(frame);
        break;

      case 'ack':
        this.onAckFrame(frame);
        break;
      default:
        this.onUnknownFrame(frame);
    }
  }

  private onHelloFrame(frame: Extract<ServerFrame, { type: 'hello' }>): void {
    if (frame.protocolVersion !== SUPPORTED_PROTOCOL_VERSION) {
      const reason =
        `the bridge speaks protocol version ${frame.protocolVersion}, this client ` +
        `implements ${SUPPORTED_PROTOCOL_VERSION}`;
      this.protocolMismatch.set(reason);
      this.bridge.halt(reason);
      return;
    }

    this.auth.onHello(frame);
    this.loginFlow.onHello();
  }

  private onLoggedInFrame(frame: Extract<ServerFrame, { type: 'loggedIn' }>): void {
    this.loginFlow.onLoggedInFrame(frame);
  }

  private onLoggedIn(): void {
    this.deckStore.refreshDecks();

    const tableId = this.watchTableId();
    if (tableId) this.sendWatch(tableId);

    const stored = this.skipPrioritySettings();
    if (JSON.stringify(stored) !== JSON.stringify(DEFAULT_SKIP_PRIORITY_SETTINGS)) {
      this.bridge.send({ type: 'setSkipPrioritySteps', ...stored });
    }
  }

  private onTablesFrame(frame: Extract<ServerFrame, { type: 'tables' }>): void {
    this.lobby.onTablesFrame(frame);
  }

  private onGameStartedFrame(frame: Extract<ServerFrame, { type: 'gameStarted' }>): void {
    this.gameId.set(frame.gameId);
    this.role.set(frame.role);
    if (frame.myPlayerId) this.myPlayerId.set(frame.myPlayerId);

    if (frame.role === 'player' && !this.myTableId() && frame.tableId) {
      this.lobby.setMyTableId(frame.tableId);
    }

    this.watchState.set('watching');
    this.watchProblem.set(null);
    this.result.set(null);

    if (frame.role === 'player' && frame.tableId && !this.lobbyActionSinceLogin()) {
      this.rejoinPrompt.set(frame.tableId);
    }
  }

  private onGameStateFrame(frame: Extract<ServerFrame, { type: 'gameState' }>): void {
    this.applyGameSnapshot(frame.game);
    this.gameId.set(frame.gameId);
    if (!this.myPlayerId() && frame.game.myPlayerId) this.myPlayerId.set(frame.game.myPlayerId);
    if (this.watchState() !== 'over') this.watchState.set('watching');
  }

  private onPromptFrame(frame: Extract<ServerFrame, { type: 'prompt' }>): void {
    const previousStackIds = this.snapshot()?.stack.map((c) => c.objectId) ?? [];

    const consequential = this.glanceEvents > this.glanceEventsAtLastPrompt;
    this.glanceEventsAtLastPrompt = this.glanceEvents;
    this.prompt.set(frame.prompt);
    if (frame.game) this.applyGameSnapshot(frame.game);

    this.activeSkip.set(null);
    this.targetListOpen.set(false);
    this.choiceListOpen.set(false);

    this.autoPayer.step();
    this.triggerOrderRunner.step();
    this.autoPass.schedule(previousStackIds, consequential);
  }

  private onChatFrame(frame: Extract<ServerFrame, { type: 'chat' }>): void {
    if (isLogMessage(frame)) {
      const line = toLogLine(frame, this.nextLogId++);
      const lines = appendLogLine(this.log(), line, LOG_LINE_LIMIT);
      this.log.set(lines);

      if (lines.at(-1)?.id === line.id) {
        const event = gameEvent(line);
        if (event && GLANCE_KINDS.has(event.kind)) this.glanceEvents += 1;
      }
    }
  }

  private onGameOverFrame(frame: Extract<ServerFrame, { type: 'gameOver' }>): void {
    this.autoPass.clear();
    this.autoPayer.stop();
    this.triggerOrderRunner.stop();
    this.activeSkip.set(null);
    this.targetListOpen.set(false);
    this.choiceListOpen.set(false);
    if (frame.game) this.applyGameSnapshot(frame.game);
    this.prompt.set(null);
    this.watchState.set('over');
    this.result.update((current) => ({ ...current, text: frame.text }));
  }

  private onMatchOverFrame(frame: Extract<ServerFrame, { type: 'matchOver' }>): void {
    this.watchState.set('over');
    this.result.update((current) => ({
      ...current,
      matchInfo: frame.matchInfo,
      additionalInfo: frame.additionalInfo,
    }));
  }

  private onNoticeFrame(frame: Extract<ServerFrame, { type: 'notice' }>): void {
    this.toast(frame.level, frame.text, frame.title);
  }

  private onFailureFrame(frame: Extract<ServerFrame, { type: 'failure' }>): void {
    this.diagnostics.reportFailure(frame.action, frame.reason);

    if (frame.action !== 'login') {
      this.toast('ERROR', frame.reason, `refused: ${frame.action ?? 'unparseable frame'}`);
    }
    if (frame.action === 'watchTable') this.onWatchRefused(frame.reason);
    if (frame.action === 'viewDeck') this.deckStore.cancelViewDeck();

    if (frame.action === 'login') {
      this.loginFlow.onLoginFailure(frame.code, frame.reason, frame.activeGame);
    }
  }

  private onUnmappedFrame(frame: Extract<ServerFrame, { type: 'unmapped' }>): void {
    this.diagnostics.reportUnmapped(frame.callbackMethod, frame.payloadClass);
  }

  private onDisconnectedFrame(): void {
    this.autoPass.clear();

    this.autoPayer.stop();
    this.triggerOrderRunner.stop();
    this.xmageDropped.set(true);
    this.toast('ERROR', 'The game session was dropped. Reconnecting will start a new one.');
  }

  private onTableCreatedFrame(frame: Extract<ServerFrame, { type: 'tableCreated' }>): void {
    const shouldJoin = this.lobby.onTableCreatedFrame(frame);
    if (shouldJoin) {
      this.bridge.send({
        type: 'joinTable',
        tableId: frame.tableId,
        deckId: this.deckStore.selectedDeckId() ?? undefined,
        playmatId: this.prefs.playmatId() ?? undefined,
      });
    }
  }

  private onTableJoinedFrame(frame: Extract<ServerFrame, { type: 'tableJoined' }>): void {
    this.lobby.onTableJoinedFrame(frame);
  }

  private onMatchStartingFrame(): void {
    this.toast('INFO', 'The match is starting…');
  }

  private onAckFrame(frame: Extract<ServerFrame, { type: 'ack' }>): void {
    this.loginFlow.onAck(frame.action);
  }

  private onUnknownFrame(frame: ServerFrame): void {
    this.toast(
      'ERROR',
      `unknown frame type "${(frame as { type: string }).type}" - protocol.ts has drifted from Protocol.kt`,
    );
  }

  private onWatchRefused(reason: string): void {
    const ended = /finished|no table|DUELING/i.test(reason);
    this.watchState.set(ended && this.snapshot() ? 'over' : 'refused');
    this.watchProblem.set(reason);
  }

  private toast(level: 'INFO' | 'ERROR', text: string, title?: string): void {
    this.diagnostics.toast(level, text, title);
  }
}
