export function counterLabel(count: number, name: string): string {
  return count === 1 ? name : `${count} × ${name}`;
}
