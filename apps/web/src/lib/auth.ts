import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe } from './api';

export const ME_QUERY_KEY = ['me'] as const;

export function useMe() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe, staleTime: 60_000 });
}

/** Çıkış veya oturum değişikliği sonrası oturum bilgisini yeniden yükler. */
export function useRefreshMe() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
}

/**
 * Kullanıcı bilerek çıkış yaptı (çıkış, tüm oturumları kapatma, hesap silme). Bu durumda giriş
 * sayfasına dönüş adresi kaydedilmez; sonraki giriş ana sayfaya açılır (ADR-0009).
 */
export const SIGNED_OUT_KEY = ['signed-out'] as const;

export function useSignedOut() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.setQueryData(SIGNED_OUT_KEY, true);
    return queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  };
}

export function useWasSignedOut(): boolean {
  return useQueryClient().getQueryData<boolean>(SIGNED_OUT_KEY) ?? false;
}

/** Girişten sonra ana sayfada gösterilecek başarısız deneme sayısı (ADR-0003). */
export const LOGIN_NOTICE_KEY = ['login-notice'] as const;

/**
 * Giriş/kayıt sonrası oturum bilgisini çeker ve önbelleğe yazar. Yönlendirmeyi sayfa yapmaz;
 * oturum açılınca Gate kullanıcıyı ana sayfaya taşır (tek yönlendirme kaynağı).
 */
export function useSignedIn() {
  const queryClient = useQueryClient();
  return async (failedAttemptsSinceLastLogin = 0) => {
    queryClient.setQueryData(LOGIN_NOTICE_KEY, failedAttemptsSinceLastLogin);
    queryClient.setQueryData(SIGNED_OUT_KEY, false);
    queryClient.setQueryData(ME_QUERY_KEY, await fetchMe());
  };
}

export function useLoginNotice(): number {
  return useQueryClient().getQueryData<number>(LOGIN_NOTICE_KEY) ?? 0;
}
