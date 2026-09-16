import { GIS_SCRIPT_URL, GoogleIdentityLoader } from './google-identity';

function gisScripts(): HTMLScriptElement[] {
  return Array.from(document.head.querySelectorAll<HTMLScriptElement>('script')).filter((script) =>
    script.src.startsWith(GIS_SCRIPT_URL),
  );
}

let loader: GoogleIdentityLoader;

beforeEach(() => {
  loader = new GoogleIdentityLoader();
});

afterEach(() => {
  for (const script of gisScripts()) script.remove();
});

describe('GoogleIdentityLoader', () => {
  it('adds no script until it is called — every fixture replay and every test stays offline', () => {
    expect(gisScripts()).toHaveLength(0);
  });

  it('appends the GIS script to document.head', () => {
    void loader.load();

    const scripts = gisScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].async).toBe(true);
  });

  it('memoises, so N callers produce one fetch', () => {
    const first = loader.load();
    const second = loader.load();

    expect(second).toBe(first);
    expect(gisScripts()).toHaveLength(1);
  });
});
