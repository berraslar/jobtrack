-- Yük testi tohum verisi: 1 kullanıcıya 50 şirket, 1.000 başvuru, aşama değişiklikleri ve etkinlikler.
-- psql değişkeni: email
\set ON_ERROR_STOP on
with u as (select id from users where email = :'email'),
c as (
  insert into companies (user_id, name)
  select u.id, 'Şirket ' || n from u, generate_series(1, 50) n
  returning id, user_id
),
ranked as (select id, user_id, row_number() over () as rn from c)
insert into applications (user_id, company_id, position_title, applied_at, source, notes)
select r.user_id, r.id,
       (array['Veri Analisti', 'Veri Bilimci', 'ML Mühendisi', 'BI Uzmanı'])[1 + n % 4] || ' ' || n,
       current_date - (n % 90),
       (array['linkedin', 'kariyer_net', 'referral'])[1 + n % 3],
       'Not ' || n
from generate_series(1, 1000) n
join ranked r on r.rn = 1 + n % 50;

-- Aşama değişiklikleri trigger ile geçmişe yazılır.
update applications set current_stage = 'screening' where position_title like '%1';
update applications set current_stage = 'rejected' where position_title like '%2';

insert into activities (user_id, application_id, type, occurred_at, contact_name)
select user_id, id, 'email', now() - interval '3 days', 'İK' from applications;

analyze;
