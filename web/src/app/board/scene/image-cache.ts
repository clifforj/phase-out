export class ImageCache {
  private readonly images = new Map<string, HTMLImageElement | null>();

  constructor(
    private readonly onLoad: (key: string, image: HTMLImageElement) => void,
    private readonly retryOnError = false,
  ) {}

  get(key: string, url: string = key): HTMLImageElement | null {
    const cached = this.images.get(key);
    if (cached !== undefined) return cached;
    this.images.set(key, null);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      this.images.set(key, image);
      this.onLoad(key, image);
    };
    image.onerror = () => {
      if (this.retryOnError) this.images.delete(key);
      else this.images.set(key, null);
    };
    image.src = url;
    return null;
  }

  clear(): void {
    this.images.clear();
  }
}
