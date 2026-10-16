import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  aiStatusSchema,
  jobDescriptionSchema,
  masterCvImportSchema,
  masterCvSchema,
  tailorDraftSchema,
  tailoredCvListSchema,
  tailoredCvSchema,
  type TailoredCvCreate,
  type TailorRequest,
  activitySchema,
  applicationDetailSchema,
  applicationListSchema,
  companyDetailSchema,
  companyListSchema,
  companySchema,
  cvVersionListSchema,
  cvVersionSchema,
  profileDraftSchema,
  profileSchema,
  settingsSchema,
  statsSchema,
  type ActivityCreate,
  type ActivityUpdate,
  type Application,
  type ApplicationCreate,
  type ApplicationListQuery,
  type ApplicationStage,
  type ApplicationUpdate,
  type CompanyCreate,
  type CompanyUpdate,
  type CvVersionCreate,
  type CvVersionUpdate,
  type ProfileUpdate,
  type SettingsUpdate,
} from '@jobtrack/shared';
import { api } from './api';
import { asPdf } from './cv-file';

/** ADR-0006: dosya ham PDF gövdesi, adı URI kodlu başlıkta gider. */
const fileHeaders = (file: File) => ({ 'x-file-name': encodeURIComponent(file.name) });

// Sunucu verisinin tek kaynağı. Her değişiklikten sonra ilgili sorgular geçersiz kılınır.

export const keys = {
  applications: ['applications'] as const,
  applicationList: (query: Partial<ApplicationListQuery>) =>
    ['applications', 'list', query] as const,
  application: (id: string) => ['applications', 'detail', id] as const,
  companies: ['companies'] as const,
  company: (id: string) => ['companies', 'detail', id] as const,
  cvVersions: ['cv-versions'] as const,
  settings: ['settings'] as const,
  profile: ['profile'] as const,
  stats: ['applications', 'stats'] as const,
  masterCv: ['master-cv'] as const,
  aiStatus: ['ai-status'] as const,
  jobDescription: (applicationId: string) => ['applications', 'job', applicationId] as const,
  tailoredCvs: (applicationId: string) => ['applications', 'tailored', applicationId] as const,
};

function toSearchParams(query: Partial<ApplicationListQuery>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function useApplications(query: Partial<ApplicationListQuery>) {
  return useQuery({
    queryKey: keys.applicationList(query),
    queryFn: () => api(`/applications${toSearchParams(query)}`, { schema: applicationListSchema }),
    select: (data) => data.applications,
    placeholderData: (previous) => previous,
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: keys.application(id),
    queryFn: () => api(`/applications/${id}`, { schema: applicationDetailSchema }),
  });
}

export function useCompanies() {
  return useQuery({
    queryKey: keys.companies,
    queryFn: () => api('/companies', { schema: companyListSchema }),
    select: (data) => data.companies,
  });
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: keys.company(id),
    queryFn: () => api(`/companies/${id}`, { schema: companyDetailSchema }),
  });
}

export function useCvVersions() {
  return useQuery({
    queryKey: keys.cvVersions,
    queryFn: () => api('/cv-versions', { schema: cvVersionListSchema }),
    select: (data) => data.cvVersions,
  });
}

/** FR-12. Anahtar 'applications' altında: başvuru değişince pano da tazelenir. */
export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: () => api('/stats', { schema: statsSchema }) });
}

export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => api('/settings', { schema: settingsSchema }),
  });
}

/** Başvuru, şirket veya CV değişince sayılar ve listeler birlikte tazelenir. */
function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.applications }),
      queryClient.invalidateQueries({ queryKey: keys.companies }),
      queryClient.invalidateQueries({ queryKey: keys.cvVersions }),
    ]);
}

export function useCreateApplication() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: ApplicationCreate) =>
      api('/applications', { method: 'POST', body, schema: applicationDetailSchema }),
    onSuccess: invalidate,
  });
}

export function useUpdateApplication(id: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: ApplicationUpdate) =>
      api(`/applications/${id}`, { method: 'PATCH', body, schema: applicationDetailSchema }),
    onSuccess: invalidate,
  });
}

/**
 * FR-09: aşama değişikliği. Kanban'da kart anında yeni sütuna geçer (iyimser güncelleme);
 * sunucu reddederse eski hâline döner.
 */
export function useChangeStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: ApplicationStage }) =>
      api(`/applications/${id}/stage`, {
        method: 'POST',
        body: { stage },
        schema: applicationDetailSchema,
      }),
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: keys.applications });
      const snapshots = queryClient.getQueriesData<{ applications: Application[] }>({
        queryKey: [...keys.applications, 'list'],
      });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData(key, {
          applications: data.applications.map((a) =>
            a.id === id ? { ...a, currentStage: stage } : a,
          ),
        });
      }
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.applications }),
  });
}

export function useSetArchived(id: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (archived: boolean) =>
      api(`/applications/${id}/${archived ? 'archive' : 'unarchive'}`, {
        method: 'POST',
        schema: applicationDetailSchema,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteApplication() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api(`/applications/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useAddActivity(applicationId: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: ActivityCreate) =>
      api(`/applications/${applicationId}/activities`, {
        method: 'POST',
        body,
        schema: activitySchema,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateActivity() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ActivityUpdate }) =>
      api(`/activities/${id}`, { method: 'PATCH', body, schema: activitySchema }),
    onSuccess: invalidate,
  });
}

export function useDeleteActivity() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api(`/activities/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useCreateCompany() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: CompanyCreate) =>
      api('/companies', { method: 'POST', body, schema: companySchema }),
    onSuccess: invalidate,
  });
}

export function useUpdateCompany(id: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: CompanyUpdate) =>
      api(`/companies/${id}`, { method: 'PATCH', body, schema: companySchema }),
    onSuccess: invalidate,
  });
}

export function useDeleteCompany() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api(`/companies/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useCreateCvVersion() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: CvVersionCreate) =>
      api('/cv-versions', { method: 'POST', body, schema: cvVersionSchema }),
    onSuccess: invalidate,
  });
}

export function useUpdateCvVersion() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CvVersionUpdate }) =>
      api(`/cv-versions/${id}`, { method: 'PATCH', body, schema: cvVersionSchema }),
    onSuccess: invalidate,
  });
}

export function useDeleteCvVersion() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api(`/cv-versions/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SettingsUpdate) =>
      api('/settings', { method: 'PATCH', body, schema: settingsSchema }),
    onSuccess: async (data) => {
      queryClient.setQueryData(keys.settings, data);
      await queryClient.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

/** FR-08: sürükle-bırakla yeni CV versiyonu ve dosyası, tek istekte. */
export function useUploadCvVersion() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ label, file }: { label: string; file: File }) =>
      api('/cv-versions/upload', {
        method: 'POST',
        body: asPdf(file),
        headers: { ...fileHeaders(file), 'x-cv-label': encodeURIComponent(label) },
        schema: cvVersionSchema,
      }),
    onSuccess: invalidate,
  });
}

export function useReplaceCvFile() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      api(`/cv-versions/${id}/file`, {
        method: 'PUT',
        body: asPdf(file),
        headers: fileHeaders(file),
        schema: cvVersionSchema,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteCvFile() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api(`/cv-versions/${id}/file`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

/** FR-20: kullanıcı profili. */
export function useProfile() {
  return useQuery({
    queryKey: keys.profile,
    queryFn: () => api('/profile', { schema: profileSchema }),
  });
}

export function useSaveProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileUpdate) =>
      api('/profile', { method: 'PUT', body, schema: profileSchema }),
    onSuccess: (profile) => {
      queryClient.setQueryData(keys.profile, profile);
    },
  });
}

/** FR-21: CV dosyasından öneri. Sunucu hiçbir şey kaydetmez; önbellek de değişmez. */
export function useExtractProfile() {
  return useMutation({
    mutationFn: (cvVersionId: string) =>
      api('/profile/extract', {
        method: 'POST',
        body: { cvVersionId },
        schema: profileDraftSchema,
      }),
  });
}

// FR-23: Ana CV ve ilan metni

export function useMasterCv() {
  return useQuery({
    queryKey: keys.masterCv,
    queryFn: () => api('/master-cv', { schema: masterCvSchema }),
  });
}

/** FR-23: PDF CV'den Ana CV taslağı; kaydetmez. */
export function useImportMasterCv() {
  return useMutation({
    mutationFn: (file: File) =>
      api('/master-cv/import', { method: 'POST', body: asPdf(file), schema: masterCvImportSchema }),
  });
}

export function useSaveMasterCv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (markdown: string) =>
      api('/master-cv', { method: 'PUT', body: { markdown }, schema: masterCvSchema }),
    onSuccess: (masterCv) => {
      queryClient.setQueryData(keys.masterCv, masterCv);
    },
  });
}

export function useJobDescription(applicationId: string | null) {
  return useQuery({
    queryKey: keys.jobDescription(applicationId ?? ''),
    queryFn: () =>
      api(`/applications/${applicationId ?? ''}/job-description`, {
        schema: jobDescriptionSchema,
      }),
    enabled: applicationId !== null,
  });
}

/** FR-22, FR-23: yeni oluşturulan başvuruya, yer iminden gelen ilan metnini kaydeder. */
export function useSaveJobDescriptionFor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      jobDescription,
    }: {
      applicationId: string;
      jobDescription: string;
    }) =>
      api(`/applications/${applicationId}/job-description`, {
        method: 'PUT',
        body: { jobDescription },
        schema: jobDescriptionSchema,
      }),
    onSuccess: (saved, { applicationId }) => {
      queryClient.setQueryData(keys.jobDescription(applicationId), saved);
    },
  });
}

export function useSaveJobDescription(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobDescription: string) =>
      api(`/applications/${applicationId}/job-description`, {
        method: 'PUT',
        body: { jobDescription },
        schema: jobDescriptionSchema,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.jobDescription(applicationId), saved);
    },
  });
}

// FR-24: yapay zekâ ile uyarlama ve sürümler (ADR-0010)

export function useAiStatus() {
  return useQuery({
    queryKey: keys.aiStatus,
    queryFn: () => api('/ai/status', { schema: aiStatusSchema }),
    staleTime: 5 * 60_000,
  });
}

/** Taslak üretir; sunucu kaydetmez, önbellek de değişmez. */
export function useTailor(applicationId: string) {
  return useMutation({
    mutationFn: (body: TailorRequest) =>
      api(`/applications/${applicationId}/tailor`, {
        method: 'POST',
        body,
        schema: tailorDraftSchema,
      }),
  });
}

export function useTailoredCvs(applicationId: string | null) {
  return useQuery({
    queryKey: keys.tailoredCvs(applicationId ?? ''),
    queryFn: () =>
      api(`/applications/${applicationId ?? ''}/tailored-cvs`, { schema: tailoredCvListSchema }),
    enabled: applicationId !== null,
  });
}

export function useCreateTailoredCv(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TailoredCvCreate) =>
      api(`/applications/${applicationId}/tailored-cvs`, {
        method: 'POST',
        body,
        schema: tailoredCvSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.tailoredCvs(applicationId) }),
  });
}

export function useUpdateTailoredCv(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, markdown }: { id: string; markdown: string }) =>
      api(`/tailored-cvs/${id}`, { method: 'PUT', body: { markdown }, schema: tailoredCvSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.tailoredCvs(applicationId) }),
  });
}

export function useDeleteTailoredCv(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/tailored-cvs/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.tailoredCvs(applicationId) }),
  });
}
