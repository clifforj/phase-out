import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  type WritableSignal,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Target, Wand2 } from 'lucide';
import { CardArtService } from '../core/card-art';
import { GameStore } from '../core/game-store';
import { ActionBarComponent } from './overlay/prompts/action-bar.component';
import { boardBanner, boardStale } from '../rules/board-status';
import { clickActionType } from '../rules/prompt-actions';
import { ChoiceListPanelComponent } from './overlay/prompts/choice-list-panel.component';
import type { GameEvent } from '../rules/game-events';
import { turnStateOf } from '../rules/turn-state';
import { FanDisclaimerComponent } from '../ui/fan-disclaimer.component';
import { BoardArt } from './board-art';
import { type MenuTarget, menuFor } from './board-menus';
import { ConcedeFlow } from './concede-flow';
import { inspectionFor } from './inspection';
import { LifeFlashTracker } from './life-flash';
import { BoardHeaderComponent } from './overlay/board-header.component';
import { CardChoiceComponent } from './overlay/card-choice.component';
import { CardInspectorComponent } from './overlay/card-inspector.component';
import { CardListPanelComponent } from './overlay/card-list-panel.component';
import { CardWindowsComponent } from './overlay/card-windows.component';
import { ConcedeDialogComponent } from './overlay/concede-dialog.component';
import { ContextMenuComponent } from './overlay/context-menu.component';
import { CostTagComponent } from './overlay/cost-tag.component';
import { EventFeedComponent } from './overlay/event-feed.component';
import { GameLogComponent } from './overlay/game-log.component';
import { GameResultComponent } from './overlay/game-result.component';
import { SeatHudComponent } from './overlay/seat-hud.component';
import { StackLabelComponent } from './overlay/stack-label.component';
import { TargetArrowsComponent } from './overlay/target-arrows.component';
import { TriggerOrderComponent } from './overlay/trigger-order.component';
import { TurnAnnounceComponent } from './overlay/turn-announce.component';
import { ZoneBrowserComponent } from './overlay/zone-browser.component';
import { ZoneLabelComponent } from './overlay/zone-label.component';
import { PromptState } from './prompt-state';
import { defaultFocusPlayerId, layoutBoard } from './scene/layout';
import { SceneHost } from './scene-host';
import type { AnchorSet, CameraView, SeatAnchor } from './scene-types';
import { StackView } from './stack-view';
import { ZoneBrowsing } from './zone-browsing';

@Component({
  selector: 'app-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FanDisclaimerComponent,
    BoardHeaderComponent,
    SeatHudComponent,
    StackLabelComponent,
    ZoneLabelComponent,
    ZoneBrowserComponent,
    CardChoiceComponent,
    CardListPanelComponent,
    ChoiceListPanelComponent,
    CostTagComponent,
    TurnAnnounceComponent,
    TriggerOrderComponent,
    CardInspectorComponent,
    ContextMenuComponent,
    ActionBarComponent,
    EventFeedComponent,
    GameLogComponent,
    CardWindowsComponent,
    TargetArrowsComponent,
    GameResultComponent,
    ConcedeDialogComponent,
  ],
  host: {
    '(document:keydown.escape)': 'onEscape()',
    '(document:keydown.h)': 'onToggleKey(handOpen, $event)',
    '(document:keydown.l)': 'onToggleKey(logOpen, $event)',
    '(document:keydown.space)': 'onPassKey($event)',
  },
  templateUrl: './board.component.html',
  styleUrl: './board.component.css',
})
export class BoardComponent {
  protected readonly store = inject(GameStore);
  private readonly art = inject(CardArtService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);

  readonly tableId = input.required<string>();

  protected readonly stackIcon = Wand2;
  protected readonly targetIcon = Target;

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  private readonly viewportRef = viewChild<ElementRef<HTMLElement>>('viewport');

  protected readonly hoveredId = signal<string | null>(null);

  protected readonly inspectedId = signal<string | null>(null);
  protected readonly menuTarget = signal<MenuTarget | null>(null);
  protected readonly logOpen = signal(false);
  protected readonly popoverOpen = signal(false);
  protected readonly handOpen = signal(true);
  protected readonly resultDismissed = signal(false);

  private readonly focusPlayerId = signal<string | null>(null);

  protected readonly anchors = signal<AnchorSet>({ seats: [], stack: [], zones: [], cards: [] });
  protected readonly views: CameraView[] = ['table', 'top', 'seat'];

  protected readonly layout = computed(() => {
    const game = this.store.snapshot();
    return layoutBoard(game, this.focusPlayerId() ?? defaultFocusPlayerId(game), {
      showHand: this.handOpen(),
      raisedIds: [this.hoveredId(), this.inspectedId()].filter((id): id is string => !!id),
    });
  });
  protected readonly seats = computed(() => this.layout().seats);
  protected readonly turn = computed(() => turnStateOf(this.store.snapshot(), this.store.round()));
  protected readonly myHand = computed(() => this.store.snapshot()?.myHand ?? []);
  protected readonly lookedAt = computed(() => this.store.snapshot()?.lookedAt ?? []);
  protected readonly revealed = computed(() => this.store.snapshot()?.revealed ?? []);

  protected readonly showResult = computed(() =>
    this.resultDismissed() ? null : this.store.result(),
  );
  protected readonly stale = boardStale(this.store);
  protected readonly banner = boardBanner(this.store);

  protected readonly prompts = new PromptState(this.store, this.seats);
  protected readonly stack = new StackView(this.store, {
    anchors: this.anchors,
    seats: this.seats,
    seatAnchor: (seat) => this.anchorFor(seat),
    payingMana: this.prompts.payingMana,
  });
  protected readonly zones = new ZoneBrowsing(this.store, {
    layout: this.layout,
    anchors: this.anchors,
    stackBox: this.stack.box,
    targetGroups: this.prompts.zoneTargetGroups,
  });
  private readonly boardArt = new BoardArt(this.art, this.layout);
  protected readonly concede = new ConcedeFlow(this.store, this.router);
  protected readonly lifeFlash = new LifeFlashTracker();
  protected readonly sceneHost = new SceneHost();

  protected readonly inspection = computed(() =>
    inspectionFor(this.inspectedId(), this.layout(), this.stack.cards()),
  );
  protected readonly menu = computed(() =>
    menuFor(
      this.menuTarget(),
      this.layout().placements,
      this.seats(),
      this.store.watchState() === 'over',
    ),
  );

  private requested: string | null = null;

  constructor() {
    this.store.connect();

    effect(() => {
      const tableId = this.tableId();
      if (this.requested === tableId) return;
      this.requested = tableId;
      if (this.store.myTableId() === tableId && this.store.gameId()) return;
      this.store.watch(tableId);
    });

    effect(() => {
      const role = this.store.role();
      if (role) this.title.setTitle(`${role === 'player' ? 'Playing' : 'Watching'} - Phase Out`);
    });

    afterNextRender(() => this.startScene());

    effect(() =>
      this.sceneHost.update(() => ({
        layout: this.layout(),
        playableIds: this.prompts.playableHighlight(),
        actionableIds: this.prompts.actionable(),
        chosenIds: this.prompts.chosen(),
        hoveredId: this.hoveredId(),
        inspectedId: this.inspectedId(),
        hoveredZone: this.zones.hovered(),
        openZone: this.zones.open(),
        trackedIds: this.stack.trackedIds(),
        artUrls: this.boardArt.urls(),
        artists: this.boardArt.artists(),
        handAway: !this.handOpen(),
      })),
    );

    effect(() => {
      if (!this.store.result()) this.resultDismissed.set(false);
    });
    effect(() => this.lifeFlash.track(this.store.snapshot()));

    inject(DestroyRef).onDestroy(() => {
      this.lifeFlash.clear();
      this.sceneHost.dispose();
    });
  }

  protected anchorFor(seat: number): SeatAnchor | null {
    return this.anchors().seats.find((anchor) => anchor.seat === seat) ?? null;
  }

  protected onEscape(): void {
    if (this.concede.confirming()) this.concede.cancel();
    else if (this.menuTarget()) this.menuTarget.set(null);
    else if (this.inspectedId()) this.inspectedId.set(null);
    else if (this.logOpen()) this.logOpen.set(false);
    else if (this.popoverOpen()) this.popoverOpen.set(false);
    else if (this.prompts.cardChoice()) this.store.cancel();
    else if (this.store.targetListOpen()) this.store.targetListOpen.set(false);
    else if (this.store.choiceListOpen()) this.store.choiceListOpen.set(false);
    else if (this.zones.open()) this.zones.close();
  }

  protected onToggleKey(flag: WritableSignal<boolean>, event: Event): void {
    if (isTyping(event)) return;
    flag.update((open) => !open);
  }

  protected onPassKey(event: Event): void {
    if (isTyping(event)) return;
    if (this.store.decision()?.kind !== 'GAME_SELECT') return;
    event.preventDefault();
    this.store.passPriority();
  }

  protected onPick(objectId: string | null): void {
    if (!objectId) {
      this.inspectedId.set(null);
      return;
    }
    if (this.prompts.actOn(objectId)) return;
    const placement = this.layout().placements.find((candidate) => candidate.objectId === objectId);
    this.inspectedId.set(placement?.kind === 'hand' ? null : objectId);
  }

  protected pickFromZone(objectId: string): void {
    const oneShot = clickActionType(this.store.decision()) === 'activate';
    if (this.prompts.actOn(objectId) && oneShot) this.zones.close();
  }

  protected onContextMenu(objectId: string | null, x: number, y: number): void {
    this.menuTarget.set(objectId ? { kind: 'card', objectId, x, y } : null);
  }

  protected onMenuAction(action: string): void {
    const target = this.menuTarget();
    this.menuTarget.set(null);
    if (!target) return;
    if (target.kind === 'card') {
      if (action === 'view') this.inspectedId.set(target.objectId);
      return;
    }
    if (action === 'focus') this.focusPlayerId.set(target.playerId);
    else if (action === 'graveyard' || action === 'exile') {
      const seat = this.seats().find((candidate) => candidate.player.playerId === target.playerId);
      if (seat) this.zones.openFor(seat.index, action);
    } else if (action === 'concede') this.concede.request();
  }

  protected onEventPick(event: GameEvent): void {
    const placements = this.layout().placements;
    const objectId = event.objectIds.find((id) =>
      placements.some((placement) => placement.objectId === id && placement.kind !== 'hand'),
    );
    if (objectId) this.inspectedId.set(objectId);
    else this.logOpen.set(true);
  }

  protected onSeatMenu(
    playerId: string,
    request: { x: number; y: number; primary: boolean },
  ): void {
    if (request.primary && this.prompts.targetPlayer(playerId)) return;
    const rect = this.canvasRef()?.nativeElement.getBoundingClientRect();
    this.menuTarget.set({
      kind: 'seat',
      playerId,
      x: request.x - (rect?.left ?? 0),
      y: request.y - (rect?.top ?? 0),
    });
  }

  private startScene(): void {
    this.sceneHost.start(
      this.canvasRef()?.nativeElement,
      this.viewportRef()?.nativeElement ?? null,
      {
        onHover: (objectId) => this.hoveredId.set(objectId),
        onPick: (objectId) => this.onPick(objectId),
        onContextMenu: (objectId, x, y) => this.onContextMenu(objectId, x, y),
        onZoneHover: (zone) => this.zones.pointAt(zone),
        onZonePick: (zone) => this.zones.open.set(zone),
        onAnchors: (anchors) => this.anchors.set(anchors),
      },
    );
  }
}

function isTyping(event: Event): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  return target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName);
}
