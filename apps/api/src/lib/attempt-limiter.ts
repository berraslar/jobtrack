/**
 * Anahtar başına (örn. e-posta) başarısız deneme sayacı (A07).
 * Tek API süreci olduğu için bellekte tutulur (KISS; Redis yok). Yeniden başlatmada sıfırlanır.
 * Anahtar, hesabın var olup olmamasından bağımsız sayılır; böylece kilit davranışı hesap varlığını sızdırmaz.
 *
 * Bellek sınırlıdır: anahtar sayısı `maxKeys`e ulaşınca önce süresi dolanlar silinir, yine doluysa
 * en eski anahtar atılır. Çok sayıda farklı anahtarla belleği şişirme (DoS) böylece engellenir;
 * bedeli, aşırı yük altında en eski kayıtların erken unutulmasıdır.
 */
export class AttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  get size(): number {
    return this.failures.size;
  }

  isBlocked(key: string): boolean {
    return this.recent(key).length >= this.maxFailures;
  }

  fail(key: string): void {
    if (!this.failures.has(key) && this.failures.size >= this.maxKeys) this.makeRoom();
    const list = this.recent(key);
    list.push(this.now());
    this.failures.set(key, list);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private makeRoom(): void {
    for (const key of [...this.failures.keys()]) this.recent(key);
    if (this.failures.size >= this.maxKeys) {
      const oldest = this.failures.keys().next();
      if (!oldest.done) this.failures.delete(oldest.value);
    }
  }

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const list = (this.failures.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length === 0) this.failures.delete(key);
    return list;
  }
}
