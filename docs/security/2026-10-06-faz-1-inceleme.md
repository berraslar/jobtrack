# Güvenlik incelemesi: Faz 1 (kimlik doğrulama)

- Tarih: 2026-10-06
- Kapsam: `5a10680` commit'indeki tüm kod (Faz 0 + Faz 1)
- Yöntem: OWASP Top 10:2025 ve ASVS 5.0 Seviye 2'ye göre elle kod incelemesi; her bulgu kodda doğrulandı. Düzeltmeler regresyon testiyle korunur.
- Sonuç: Kritik veya yüksek bulgu yok. 3 orta ve 4 düşük bulgunun hepsi düzeltildi.

| #   | Önem  | Kategori      | Bulgu                                                                                                                                   | Düzeltme                                                                                                                                      | Test                                                            |
| --- | ----- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Orta  | A09           | Drizzle hata mesajı sorgu parametrelerini (parola hash'i, e-posta, şifreli TOTP anahtarı) içeriyor ve 500 hatalarında loga yazılıyordu. | `toLoggableError`: parametreler, PostgreSQL `message`/`detail` alanları ve stack'in ilk satırı atılır; yalnızca SQL metni ve hata kodu kalır. | `app.test.ts`: hassas veri loga yazılmaz                        |
| 2   | Orta  | A07           | MFA deneme sayacı yarım oturuma bağlıydı; yeniden giriş yaparak sınırsız TOTP denemesi yapılabiliyordu.                                 | Sayaç kullanıcıya bağlandı (15 dakikada 5 hata).                                                                                              | Yeni yarım oturum sayacı sıfırlamaz                             |
| 3   | Orta  | A07 / ASVS L2 | MFA etkinleştirme parola istemiyordu; ele geçirilmiş bir oturumla MFA saldırganın cihazına bağlanabilirdi.                              | `/mfa/enable` mevcut parolayı ister; hatalı parola giriş kilidini besler; rota hız sınırı eklendi.                                            | MFA etkinleştirme mevcut parolayı ister                         |
| 4   | Düşük | A07           | TOTP "son kullanılan adım" kontrolü önce okuyup sonra yazıyordu; eşzamanlı iki istek aynı kodu kullanabilirdi.                          | `claimTotpStep`: tek, koşullu `UPDATE … WHERE totp_last_step < step`.                                                                         | Çakışan iki transaction (deterministik) + eşzamanlı HTTP isteği |
| 5   | Düşük | ASVS 14.3     | API yanıtlarında `Cache-Control` yoktu; `/me` (e-posta, CSRF token) tarayıcı önbelleğinde kalabilirdi.                                  | Tüm API yanıtlarına `Cache-Control: no-store`.                                                                                                | API yanıtları önbelleğe alınmaz                                 |
| 6   | Düşük | DoS           | Bellekteki deneme sayacı her yeni e-posta için kayıt açıyor ve hiç temizlemiyordu.                                                      | En fazla 10.000 anahtar; dolunca süresi geçenler, sonra en eski kayıt silinir.                                                                | Anahtar sınırı aşılınca bellek büyümez                          |
| 7   | Düşük | İşlevsel      | Geçersiz `__Host-` çerezi `Secure` bayrağı olmadan silinmeye çalışıldığı için tarayıcı silmiyordu.                                      | Silme yanıtı `Secure`, `HttpOnly`, `SameSite=Lax` taşır.                                                                                      | Geçersiz çerezi Secure ile siler                                |

## Bilinçli olarak kabul edilen riskler

- **Hesap kilidi ile hizmet engelleme:** E-postayı bilen biri 5 hatalı denemeyle hesabı 15 dakika kilitleyebilir. Parola tahminine karşı korumanın bilinen bedeli.
- **Kayıtta e-posta varlığı:** Kayıt açıkken 409 yanıtı e-postanın kayıtlı olduğunu belli eder. Üretimde kayıt kapalıdır (ADR-0003).
- **Sıfırlama komutu:** `reset-password` yeni parolayı yazılırken ekranda gösterir. Komutu yalnızca sunucu yöneticisi çalıştırır.
- **Bellek içi sayaçlar:** API yeniden başlarsa deneme sayaçları sıfırlanır (tek süreç, KISS).
