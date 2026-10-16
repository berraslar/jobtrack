// NFR-04: 1.000 başvuru kaydıyla API yanıtlarının 95. yüzdeliği 200 ms altında.
// Çalıştırma: ./scripts/load-test.sh  (yalıtılmış ortamı kurar, veriyi tohumlar, k6'yı çalıştırır)
//
// Yük, IP başına dakikada 300 isteklik güvenlik sınırının altında tutulur (saniyede 4 istek):
// sınır kapatılmaz; ölçülen şey tek kullanıcılı uygulamanın gecikmesidir, kaba kuvvet kapasitesi değil.
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL;
const HEADERS = { origin: BASE, 'content-type': 'application/json' };

export const options = {
  scenarios: {
    gecikme: {
      executor: 'constant-arrival-rate',
      rate: 4,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 4,
      maxVUs: 8,
    },
  },
  thresholds: {
    'http_req_duration{expected_response:true}': ['p(95)<200'],
    'http_req_duration{endpoint:list}': ['p(95)<200'],
    'http_req_duration{endpoint:search}': ['p(95)<200'],
    'http_req_duration{endpoint:detail}': ['p(95)<200'],
    'http_req_duration{endpoint:stats}': ['p(95)<200'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ email: __ENV.LOAD_EMAIL, password: __ENV.LOAD_PASSWORD }),
    { headers: HEADERS },
  );
  check(res, { 'giriş 200': (r) => r.status === 200 });
  const cookie = res.cookies['__Host-session'][0].value;
  const list = http.get(`${BASE}/api/applications`, {
    headers: { ...HEADERS, cookie: `__Host-session=${cookie}` },
  });
  const ids = list.json('applications').map((a) => a.id);
  if (ids.length < 1000) throw new Error(`1000 başvuru bekleniyordu, ${ids.length} var`);
  return { cookie, ids };
}

export default function (data) {
  const params = (endpoint) => ({
    headers: { ...HEADERS, cookie: `__Host-session=${data.cookie}` },
    tags: { endpoint },
  });
  const pick = Math.random();
  let res;
  if (pick < 0.35) res = http.get(`${BASE}/api/applications`, params('list'));
  else if (pick < 0.55)
    res = http.get(`${BASE}/api/applications?q=veri&followUp=true`, params('search'));
  else if (pick < 0.85) {
    const id = data.ids[Math.floor(Math.random() * data.ids.length)];
    res = http.get(`${BASE}/api/applications/${id}`, params('detail'));
  } else res = http.get(`${BASE}/api/stats`, params('stats'));
  check(res, { 200: (r) => r.status === 200 });
}
