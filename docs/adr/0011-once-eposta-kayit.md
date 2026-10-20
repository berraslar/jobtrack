# ADR-0011: Önce e-posta, sonra hesap (kayıtta hesap varlığını gizleme)

- Durum: Kabul edildi (ADR-0007 §4'ün yerini alır)
- Tarih: 2026-10-20
- İlgili: FR-01, FR-18, FR-19, A01, A07, ADR-0002, ADR-0007

## Bağlam

Güvenlik denetiminde kayıt ucunun hesabın varlığını belli ettiği görüldü: kayıtlı bir e-postayla kayıt denemesi 409 dönüyordu. Giriş ucu bu bilgiyi gizliyordu (A07) ama kayıt ucu gizlemiyordu. Kayıt varsayılan olarak kapalı ve IP başına saatte 5 istekle sınırlı olduğu için risk düşüktü. Kullanıcı yine de bu sızıntının tamamen kapatılmasını istedi.

## Karar

1. **Kayıt hesap açmaz.** `POST /auth/register` girdiyi doğrular, sızıntı kontrolünü yapar, parolayı Argon2id ile hash'ler ve `pending_registrations` tablosuna bir satır yazar. Ardından adrese 6 haneli kod gönderir. Yanıt `202 {status: 'email_required', ...}` olur. Tarayıcıya yalnızca bekleyen kaydın çerezi verilir (`__Host-registration`: HttpOnly, Secure, SameSite=Lax, 1 saat). Oturum açılmaz.
2. **Hesap kod doğrulanınca açılır.** `POST /auth/register/verify` doğru kodu alınca tek bir transaction'da şunları yapar:
   - bekleyen kaydı siler,
   - kullanıcıyı `email_verified_at` dolu olarak oluşturur,
   - denetim kaydına `register`, `email_verified` ve `login_success` olaylarını yazar,
   - tam oturum açar ve cihazı 30 gün hatırlar (FR-19).

   Eşzamanlı iki doğrulamadan yalnızca biri satırı silebilir.

3. **Kayıtlı adres aynı yanıtı alır.** Adres zaten bir hesaba aitse de bekleyen kayıt satırı yazılır. Bu satırın `password_hash` alanı NULL'dır ve kodu hiç gönderilmez. Adrese kod yerine "bu adresle kayıt denendi" bilgilendirmesi gider. Böylece hesabın var olduğunu yalnızca adresin sahibi öğrenir. Sızıntı kontrolü, hash'leme, sorgular ve e-posta gönderimi iki durumda da aynı sırayla çalışır. Doğrulama ve yeniden gönderme ucu da aynı davranır: hiçbir kod bu satırı tamamlayamaz ve hata, yanlış kodla aynıdır (`invalid_email_code`). Hesaba hiçbir şekilde dokunulmaz.
4. **Erişim (A01, ADR-0002).** Bekleyen kayıt tablosunda FORCE RLS açıktır. Uygulama yalnızca çerezindeki token'ın özetine (`app.registration_token`) ait satırı görür ve değiştirebilir. Bu ayar `withUserTx`'teki gibi transaction'a özeldir. Satırlar arası iki işlem SECURITY DEFINER fonksiyonlarıyla yapılır: süresi dolanları silmek ve adres başına gönderilen e-posta sayısını almak. Bu fonksiyonlar satır değil, yalnızca toplam döndürür.
5. **Sınırlar (A07).**
   - Kod 2 dakika geçerlidir; kod başına en fazla 5 deneme yapılabilir.
   - Yeni kod için 60 saniye beklenir.
   - Bir adrese, tüm bekleyen kayıtlar toplamında saatte en fazla 5 e-posta gönderilir. Bu, e-posta bombardımanını da sınırlar.
   - Uç noktalar ayrıca IP bazlı hız sınırı altındadır.
   - Kodun özeti kayıt token'ına bağlıdır, bu yüzden başka bir kaydın satırında geçmez.
   - Bekleyen kayıt 1 saat sonra silinir.

## Sonuçlar

- Kayıt ve giriş uçları, hesabın var olup olmadığını belli etmez.
- Kayıtlı adresiyle yeniden kayıt olmaya çalışan gerçek kullanıcı hata görmez; kod ekranına geçer ve bilgilendirme e-postası alır. Kod ekranındaki not bu durumu herkese aynı şekilde açıklar.
- Hesap tablosunda artık doğrulanmamış hesap oluşmaz. Bu karardan önce açılmış doğrulanmamış hesaplar ise ADR-0007 §5'teki gibi ilk girişte e-posta koduyla doğrulanır.
- Biri başkasının adresiyle kayıt başlatırsa adres sahibine kod gider. Kod onda kaldığı sürece hesap açılamaz. Saatlik sınır, adrese giden e-posta sayısını da sınırlar.
