-- Faz 4: hesap silme (FR-14, KVKK).
--
-- Kullanıcı silindiğinde şirketler ve başvurular aynı komutta, zincirleme (CASCADE) silinir.
-- RESTRICT kısıtı satır silindiği anda kontrol edildiği için, PostgreSQL şirketi başvurudan önce
-- silmeye çalışırsa hesap silme başarısız olurdu. NO ACTION aynı korumayı sağlar (başvurusu olan şirket
-- tek başına silinemez) ama kontrolü komutun sonuna bırakır; o anda başvurular da silinmiş olur.
ALTER TABLE applications DROP CONSTRAINT applications_company_id_user_id_fkey;
ALTER TABLE applications
  ADD CONSTRAINT applications_company_id_user_id_fkey
  FOREIGN KEY (company_id, user_id) REFERENCES companies (id, user_id) ON DELETE NO ACTION;
