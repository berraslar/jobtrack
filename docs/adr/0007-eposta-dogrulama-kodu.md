# ADR-0007: E-posta doğrulama kodu ve güvenilen cihazlar

- Durum: Kabul edildi (ADR-0003 §1'in yerini kısmen alır; §4'ün yerini ADR-0011 aldı)
- Tarih: 2026-10-07
- İlgili: FR-14, FR-18, FR-19, A04, A07, A09, NFR-14

## Bağlam

Kullanıcı, kayıt sırasında iki aşamalı güvenlik, e-postaya giden ve 2 dakika ile sınırlı bir kod ve hesap silmede ek bir güvenlik onayı istedi. ADR-0003 e-posta gönderimini MVP dışı bırakmıştı.

## Karar

1. **Kod:** 6 haneli, `crypto.randomInt` ile üretilir. 2 dakika geçerlidir ve tek kullanımlıktır. Veritabanında kodun kendisi değil, anahtarlı özeti saklanır (HMAC-SHA256; anahtar `APP_SECRET`'tan türetilir). Karşılaştırma sabit zamanlıdır. Kod hiçbir yerde loglanmaz.
2. **Amaçlar:** `login` (kayıt doğrulaması ve yeni cihaz girişi) ve `account_delete`. Kod yalnızca kendi amacında geçer. Aynı amaçla yeni kod istenince eski kod geçersiz olur.
3. **Sınırlar (A07):** Kod başına en fazla 5 deneme yapılabilir. Kullanıcı başına 15 dakikada 5 hatalı deneme hakkı vardır, aşılınca 429 döner. Geçerli bir kod varken yeni kod için 60 saniye beklenir. Amaç başına saatte en fazla 5 kod gönderilir. Uç noktalar ayrıca IP bazlı hız sınırı altındadır.
4. **Kayıt (FR-18):** _ADR-0011 ile değişti: kayıt artık hesap açmaz, hesap kod doğrulanınca açılır._ Eski karar: Hesap `email_verified_at = null` ile açılır ve yalnızca 5 dakikalık yarım oturum verilir. Kod doğrulanınca e-posta işaretlenir ve oturum kimliği yenilenerek tam oturum açılır. Kod gönderilemezse hesap da oluşmaz (aynı transaction).
5. **Giriş (FR-19):** TOTP açıksa ikinci adım yine TOTP'dir; e-posta kodu TOTP'nin yerine geçemez (`totp_required`). TOTP kapalıysa ve cihaz tanınmıyorsa e-postaya kod gider. Kod doğrulanınca 30 gün geçerli bir "güvenilen cihaz" çerezi verilir (`__Host-device`, HttpOnly, Secure, SameSite=Lax). Sunucuda bu çerezin yalnızca SHA-256 özeti tutulur ve kullanıcıya bağlıdır. "Tüm oturumları kapat" ve CLI ile parola sıfırlama, güvenilen cihazları da siler.
6. **Hesap silme (FR-14):** Parola, (açıksa) TOTP ve `POST /account/deletion-code` ile e-postaya gönderilen kod istenir.
7. **Gönderim:** Standart SMTP ile `nodemailer` kullanılır. Gmail için uygulama şifresi gerekir (465, doğrudan TLS); 587 portunda STARTTLS zorunludur. Yerel kurulum ve testlerde Mailpit kullanılır (yalnızca `127.0.0.1:8025`). Mesajlar düz metin ve hesabın dilindedir. `SMTP_HOST` test dışında zorunludur: kod gönderemeyen bir kurulum kimseyi içeri alamaz (fail closed).

## Sonuçlar

- E-posta hesabını ele geçiren biri, parolayı da bilmeden giriş yapamaz. Parolayı bilen biri de e-postaya erişmeden yeni cihazdan giremez. TOTP hâlâ en güçlü seçenektir ve önerilir.
- Kodlar e-posta altyapısından geçer; e-posta TOTP kadar güvenli bir kanal değildir. Bu yüzden TOTP açık hesapta e-posta kodu ikinci faktör olarak kabul edilmez.
- Mevcut hesaplar doğrulanmamış sayılır; ilk girişte e-posta kodu istenir ve böylece doğrulanırlar.
- E-posta adresleri ve kodlar loglanmaz. Gmail kullanılırsa e-postalar Google üzerinden gider (KVKK açısından alıcı kullanıcının kendisidir).
