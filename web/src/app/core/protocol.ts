export const SUPPORTED_PROTOCOL_VERSION = 1;

export type NoticeLevel = 'INFO' | 'ERROR';

export type GameRole = 'player' | 'spectator';

export type AuthMode = 'off' | 'required';

export interface Hello {
  type: 'hello';
  protocolVersion: number;
  bridgeSessionId: string;
  xmageServerHost: string;
  xmageServerPort: number;

  authMode?: AuthMode;

  googleClientId?: string;
}

export function authModeOf(hello: Hello): AuthMode {
  return hello.authMode ?? 'off';
}

export interface LoggedIn {
  type: 'loggedIn';

  userName: string;
  serverVersion: string;
  mainRoomId: string;

  sessionToken?: string;

  displayName?: string;
  email?: string;
  accountId?: string;

  playerName?: string;
}

export interface Disconnected {
  type: 'disconnected';
  askToReconnect: boolean;
  keepSessionActive: boolean;
}

export interface Notice {
  type: 'notice';
  level: NoticeLevel;
  text: string;
  title?: string;
  gameId?: string;
}

export interface SeatSummary {
  playerId?: string;
  playerName?: string;

  playerType: string;

  deck?: DeckSummary;
}

export interface TableSummary {
  tableId: string;
  name: string;
  controllerName: string;
  gameType: string;
  deckType: string;

  state: string;

  stateCode: string;
  seatsInfo: string;
  isTournament: boolean;
  passworded: boolean;
  seats: SeatSummary[];
  gameIds: string[];
}

export interface Tables {
  type: 'tables';
  roomId: string;
  tables: TableSummary[];
}

export interface TableCreated {
  type: 'tableCreated';
  roomId: string;
  tableId: string;
  gameType: string;
  deckType: string;
  seats: SeatSummary[];
}

export interface TableJoined {
  type: 'tableJoined';
  roomId: string;
  tableId: string;
  isTournament: boolean;
}

export interface MatchStarting {
  type: 'matchStarting';
  roomId: string;
  tableId: string;
}

export interface GameStarted {
  type: 'gameStarted';
  gameId: string;
  tableId?: string;

  myPlayerId?: string;
  role: GameRole;
}

export interface GameStateMsg {
  type: 'gameState';
  gameId: string;

  reason: string;
  message?: string;
  game: GameStateView;
}

export interface PromptMsg {
  type: 'prompt';
  gameId: string;
  prompt: PromptView;
  game?: GameStateView;
}

export interface GameOver {
  type: 'gameOver';
  gameId: string;
  text?: string;
  game?: GameStateView;
}

export interface MatchOver {
  type: 'matchOver';
  gameId: string;
  gameInfo?: string;
  matchInfo?: string;
  additionalInfo?: string;
  wins: number;
  losses: number;
  winsNeeded: number;
}

export type ChatMessageType =
  'USER_INFO' | 'STATUS' | 'GAME' | 'TALK' | 'WHISPER_FROM' | 'WHISPER_TO';

export interface Chat {
  type: 'chat';

  objectId: string;
  from?: string;

  text: string;
  turnInfo?: string;
  messageType?: ChatMessageType | string;
}

export interface Ack {
  type: 'ack';
  requestId?: string;
  action: string;
  detail?: string;
}

export type FailureCode =
  'authRequired' | 'authRejected' | 'authExpired' | 'sessionTakenOver' | 'sessionInUse';

export interface Failure {
  type: 'failure';
  requestId?: string;
  action?: string;
  reason: string;

  code?: FailureCode | string;

  activeGame?: boolean;
}

export interface Unmapped {
  type: 'unmapped';
  callbackMethod: string;
  objectId?: string;
  payloadClass?: string;
}

export interface DeckSummary {
  deckId: string;
  name: string;
  cardCount: number;

  commanders?: DeckCommander[];

  savedAt?: number;
}

export interface DeckCommander {
  name: string;
  setCode: string;
  cardNumber: string;
  colors?: string[];
}

export function deckColors(deck: DeckSummary | null | undefined): string[] {
  const found = new Set((deck?.commanders ?? []).flatMap((commander) => commander.colors ?? []));
  return [...'WUBRG'].filter((color) => found.has(color));
}

export type DeckNoteLevel = 'ERROR' | 'WARNING';

export interface DeckNote {
  level: DeckNoteLevel;
  message: string;
  lineNumber?: number;
  text?: string;
}

export interface DeckImported {
  type: 'deckImported';
  ok: boolean;
  name: string;
  deck?: DeckSummary;
  cardCount?: number;

  commanders?: string[];
  notes?: DeckNote[];

  entries?: DeckCardEntry[];
}

export interface Decks {
  type: 'decks';
  decks: DeckSummary[];

  builtIn?: DeckSummary[];
}

export interface DeckCardEntry {
  name: string;
  amount: number;
  setCode: string;
  cardNumber: string;
  category: string;
  colors?: string[];

  manaCost?: string;

  commander?: boolean;

  partnerTag?: string;
}

export interface DeckDetail {
  type: 'deckDetail';
  deckId: string;
  name: string;
  cardCount: number;
  cards: DeckCardEntry[];
}

export type ServerFrame =
  | Hello
  | LoggedIn
  | Disconnected
  | Notice
  | Tables
  | TableCreated
  | TableJoined
  | MatchStarting
  | GameStarted
  | GameStateMsg
  | PromptMsg
  | GameOver
  | MatchOver
  | Chat
  | DeckImported
  | Decks
  | DeckDetail
  | Ack
  | Failure
  | Unmapped;

export type ServerFrameType = ServerFrame['type'];

export const SERVER_FRAME_TYPES: readonly ServerFrameType[] = [
  'hello',
  'loggedIn',
  'disconnected',
  'notice',
  'tables',
  'tableCreated',
  'tableJoined',
  'matchStarting',
  'gameStarted',
  'gameState',
  'prompt',
  'gameOver',
  'matchOver',
  'chat',
  'deckImported',
  'decks',
  'deckDetail',
  'ack',
  'failure',
  'unmapped',
];

export interface CardIconView {
  type: string;
  text: string;

  hint: string;
}

export interface CounterStateView {
  name: string;
  count: number;
}

export interface CardView {
  objectId: string;
  name: string;
  displayName?: string;
  manaCost?: string;
  manaValue?: number;
  typeLine?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  rules: string[];
  setCode?: string;
  cardNumber?: string;
  imageFileName?: string;
  imageNumber?: number;

  rarity?: string;

  colors: string[];

  frameColor?: string;

  icons: CardIconView[];
  faceDown: boolean;
  isToken: boolean;
  counters: CounterStateView[];
  parentId?: string;
  targets: string[];

  isAbility?: boolean;
}

export interface PermanentStateView {
  card: CardView;
  tapped: boolean;
  flipped: boolean;
  phasedIn: boolean;
  isCopy: boolean;
  damage: number;
  controllerName?: string;
  attachedTo?: string;
  attachments: string[];

  canAttack: boolean;

  canBlock: boolean;
}

export interface CommandObjectStateView {
  objectId: string;
  name: string;
  rules: string[];

  card?: CardView;
}

export interface ManaPoolStateView {
  white: number;
  blue: number;
  black: number;
  red: number;
  green: number;
  colorless: number;
}

export interface PlayerStateView {
  playerId: string;
  name: string;
  life: number;

  isMe: boolean;
  isHuman: boolean;
  isActive: boolean;
  hasPriority: boolean;
  hasLeft: boolean;
  libraryCount: number;
  handCount: number;
  wins: number;
  winsNeeded: number;
  manaPool: ManaPoolStateView;
  battlefield: PermanentStateView[];
  graveyard: CardView[];
  exile: CardView[];
  commandZone: CommandObjectStateView[];
  counters: CounterStateView[];
  designations: string[];
  monarch: boolean;
  initiative: boolean;

  topCard?: CardView | null;

  playmatId?: string | null;
}

export interface CombatGroupStateView {
  defenderId?: string;
  defenderName?: string;
  blocked: boolean;
  attackers: CardView[];
  blockers: CardView[];
}

export interface PlayableObjectView {
  objectId: string;
  playableAbilityCount: number;

  playableImportantCount: number;

  abilityTexts: string[];

  abilityIds: string[];
}

export interface GameStateView {
  turn: number;

  phase?: string;

  step?: string;
  activePlayerId?: string;
  activePlayerName?: string;
  priorityPlayerName?: string;
  myPlayerId?: string;
  isPlayer: boolean;
  specialActionAvailable: boolean;
  players: PlayerStateView[];
  myHand: CardView[];

  stack: CardView[];
  combat: CombatGroupStateView[];
  playable: PlayableObjectView[];

  lookedAt?: LookedAtWindowView[];

  revealed?: RevealedWindowView[];
}

export interface LookedAtWindowView {
  name: string;
  cards: CardView[];
}

export interface RevealedWindowView {
  name: string;
  cards: CardView[];
}

export type PromptKind =
  | 'NONE'
  | 'GAME_SELECT'
  | 'GAME_ASK'
  | 'GAME_TARGET'
  | 'GAME_CHOOSE_ABILITY'
  | 'GAME_CHOOSE_PILE'
  | 'GAME_CHOOSE_CHOICE'
  | 'GAME_PLAY_MANA'
  | 'GAME_PLAY_XMANA'
  | 'GAME_GET_AMOUNT'
  | 'GAME_GET_MULTI_AMOUNT';

export type CombatStep = 'DECLARE_ATTACKERS' | 'DECLARE_BLOCKERS';

export interface PromptChoice {
  key: string;
  label: string;
}

export interface AmountRequest {
  message: string;
  min: number;
  max: number;
  defaultValue: number;
}

export interface PromptView {
  kind: PromptKind;
  message?: string;

  secondMessage?: string;
  required: boolean;
  min?: number;
  max?: number;
  okButtonText?: string;
  cancelButtonText?: string;
  cards: CardView[];
  cards2: CardView[];

  selectableTargets: string[];

  chosenTargets: string[];
  targetZone?: string;
  choices: PromptChoice[];
  amounts: AmountRequest[];

  combatStep?: CombatStep;

  possibleAttackers: string[];

  possibleBlockers: string[];

  specialButtonText?: string;

  expects: string[];
}

export interface LoginFrame {
  type: 'login';
  userName?: string;
  password?: string;

  googleToken?: string;

  sessionToken?: string;

  force?: boolean;
  requestId?: string;
}

export interface ListTablesFrame {
  type: 'listTables';
  requestId?: string;
}

export interface WatchTableFrame {
  type: 'watchTable';
  tableId: string;
  roomId?: string;
  requestId?: string;
}

export interface StopWatchingFrame {
  type: 'stopWatching';
  gameId: string;
  requestId?: string;
}

export interface CreateTableFrame {
  type: 'createTable';
  name?: string;
  gameType?: string;
  deckType?: string;

  players?: number;

  aiOpponents?: number;
  requestId?: string;
}

export interface JoinTableFrame {
  type: 'joinTable';
  tableId: string;
  seatName?: string;

  playerType?: string;

  deckId?: string;

  deckFile?: string;

  playmatId?: string;
  requestId?: string;
}

export interface StartMatchFrame {
  type: 'startMatch';
  tableId: string;
  requestId?: string;
}

export interface LeaveTableFrame {
  type: 'leaveTable';
  tableId: string;
  requestId?: string;
}

export interface QuickGameFrame {
  type: 'quickGame';
  gameType?: string;
  deckType?: string;
  aiOpponents?: number;

  deckId?: string;

  deckFile?: string;

  playmatId?: string;
  requestId?: string;
}

export interface ImportDeckFrame {
  type: 'importDeck';
  text: string;

  name?: string;

  commanders?: string[];

  preview?: boolean;
  requestId?: string;
}

export interface ListDecksFrame {
  type: 'listDecks';
  requestId?: string;
}

export interface DeleteDeckFrame {
  type: 'deleteDeck';
  deckId: string;
  requestId?: string;
}

export interface ViewDeckFrame {
  type: 'viewDeck';
  deckId: string;
  requestId?: string;
}

export interface SetPlayerNameFrame {
  type: 'setPlayerName';

  playerName: string;
  requestId?: string;
}

export interface SignOutFrame {
  type: 'signOut';
  requestId?: string;
}

export interface SkipPrioritySteps {
  upkeep?: boolean;
  draw?: boolean;
  main1?: boolean;
  beforeCombat?: boolean;
  endOfCombat?: boolean;
  main2?: boolean;
  endOfTurn?: boolean;
}

export interface SetSkipPrioritySteps {
  type: 'setSkipPrioritySteps';
  yourTurn?: SkipPrioritySteps;
  opponentTurn?: SkipPrioritySteps;

  stopOnDeclareAttackers?: boolean;

  stopOnDeclareBlockersWithZeroPermanents?: boolean;

  stopOnDeclareBlockersWithAnyPermanents?: boolean;
  stopOnAllMainPhases?: boolean;
  stopOnAllEndPhases?: boolean;

  stopOnStackNewObjects?: boolean;

  passPriorityCast?: boolean;
  passPriorityActivation?: boolean;
  requestId?: string;
}

export interface ActivateFrame {
  type: 'activate';
  gameId: string;
  objectId: string;
  requestId?: string;
}

export interface ChooseTargetFrame {
  type: 'chooseTarget';
  gameId: string;
  targetId: string;
  requestId?: string;
}

export interface ChooseAbilityFrame {
  type: 'chooseAbility';
  gameId: string;
  abilityId: string;
  requestId?: string;
}

export interface AnswerFrame {
  type: 'answer';
  gameId: string;
  yes: boolean;
  requestId?: string;
}

export interface PassPriorityFrame {
  type: 'passPriority';
  gameId: string;
  requestId?: string;
}

export interface CancelFrame {
  type: 'cancel';
  gameId: string;
  requestId?: string;
}

export interface SetAmountFrame {
  type: 'setAmount';
  gameId: string;
  amount: number;
  requestId?: string;
}

export interface SetAmountsFrame {
  type: 'setAmounts';
  gameId: string;
  amounts: number[];
  requestId?: string;
}

export interface ChooseValueFrame {
  type: 'chooseValue';
  gameId: string;
  value: string;
  requestId?: string;
}

export type ManaType = 'WHITE' | 'BLUE' | 'BLACK' | 'RED' | 'GREEN' | 'COLORLESS';

export interface PayManaFromPoolFrame {
  type: 'payManaFromPool';
  gameId: string;
  manaType: ManaType;
  playerId?: string;
  requestId?: string;
}

export interface SpecialFrame {
  type: 'special';
  gameId: string;
  requestId?: string;
}

export interface PlayerActionFrame {
  type: 'playerAction';
  gameId: string;
  action: string;
  data?: string;
  requestId?: string;
}

export interface ConcedeFrame {
  type: 'concede';
  gameId: string;
  requestId?: string;
}

export type GameActionFrame =
  | ActivateFrame
  | ChooseTargetFrame
  | ChooseAbilityFrame
  | AnswerFrame
  | PassPriorityFrame
  | CancelFrame
  | SetAmountFrame
  | SetAmountsFrame
  | ChooseValueFrame
  | PayManaFromPoolFrame
  | SpecialFrame
  | PlayerActionFrame
  | ConcedeFrame;

export type ClientFrame =
  | LoginFrame
  | ListTablesFrame
  | WatchTableFrame
  | StopWatchingFrame
  | CreateTableFrame
  | JoinTableFrame
  | StartMatchFrame
  | LeaveTableFrame
  | QuickGameFrame
  | SetSkipPrioritySteps
  | ImportDeckFrame
  | ListDecksFrame
  | DeleteDeckFrame
  | ViewDeckFrame
  | SetPlayerNameFrame
  | SignOutFrame
  | GameActionFrame;

export const COMMANDER_DUEL_TYPE = 'Commander Two Player Duel';
export const COMMANDER_FREE_FOR_ALL_TYPE = 'Commander Free For All';

export function gameTypeForSeats(seats: number): string {
  return seats > 2 ? COMMANDER_FREE_FOR_ALL_TYPE : COMMANDER_DUEL_TYPE;
}

export function isWatchable(table: TableSummary): boolean {
  return table.stateCode === 'DUELING';
}

export function unwatchableReason(table: TableSummary): string {
  if (isWatchable(table)) return '';
  if (table.stateCode === 'FINISHED') return 'This game has finished.';
  if (table.isTournament) return 'Tournaments are not supported yet.';
  return `Only a table that is dueling can be watched - this one is ${table.state.toLowerCase()}.`;
}
