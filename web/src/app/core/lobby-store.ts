import { Injectable, signal } from '@angular/core';
import { TableCreated, TableJoined, Tables, TableSummary } from './protocol';

@Injectable({ providedIn: 'root' })
export class LobbyStore {
  readonly tables = signal<TableSummary[]>([]);
  readonly tablesFetchedAt = signal<number | null>(null);
  readonly tablesPending = signal(false);

  readonly myTableId = signal<string | null>(null);

  private awaitingCreateJoin = false;

  beginRefresh(): void {
    this.tablesPending.set(true);
  }

  cancelRefresh(): void {
    this.tablesPending.set(false);
  }

  onTablesFrame(frame: Tables): void {
    this.tables.set(frame.tables);
    this.tablesFetchedAt.set(Date.now());
    this.tablesPending.set(false);
  }

  beginCreate(): void {
    this.awaitingCreateJoin = true;
  }

  onTableCreatedFrame(frame: TableCreated): boolean {
    this.myTableId.set(frame.tableId);
    if (!this.awaitingCreateJoin) return false;
    this.awaitingCreateJoin = false;
    return true;
  }

  onTableJoinedFrame(frame: TableJoined): void {
    this.myTableId.set(frame.tableId);
  }

  setMyTableId(tableId: string | null): void {
    this.myTableId.set(tableId);
  }

  clearMyTableIdIfMatches(tableId: string): void {
    if (this.myTableId() === tableId) this.myTableId.set(null);
  }

  clearTables(): void {
    this.tables.set([]);
    this.tablesFetchedAt.set(null);
  }
}
