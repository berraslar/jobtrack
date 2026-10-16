// Paket ortamdan bağımsızdır (lib: ES2023, types: []). URL ve URLSearchParams hem tarayıcıda hem
// Node.js'te yerleşiktir; burada yalnızca kullanılan üyeler tanımlanır (FR-22).

interface URLSearchParams {
  get(name: string): string | null;
  has(name: string): boolean;
  keys(): IterableIterator<string>;
  delete(name: string): void;
}

declare const URLSearchParams: {
  new (init?: string | Record<string, string>): URLSearchParams;
};

interface URL {
  readonly protocol: string;
  readonly username: string;
  readonly password: string;
  readonly hostname: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
  hash: string;
  toString(): string;
}

declare const URL: {
  new (url: string): URL;
};
