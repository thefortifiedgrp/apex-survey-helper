import type {
  V2Answer,
  V2ComposedSurvey,
  V2QualificationResult,
  V2SubmitResult,
  PatientInfo,
} from './types';

export class EmbedApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'EmbedApiError';
    this.status = status;
    this.body = body;
  }
}

export type FetchLike = typeof fetch;

export interface EmbedApiClientOptions {
  /**
   * Publishable key for browser-direct calls to Apex `/api/v2/embed/*`.
   * Omit when the partner proxies the survey through their own backend
   * (e.g. the-backend's `/apex/v2/embed/*`) — in that case the partner
   * backend attaches its server-side credentials and this header is unused.
   */
  publishableKey?: string;
  /**
   * Multi-tenant identifier sent as the `X-Tenant-Key` header. Required when
   * proxying through the-backend (which uses it to look up the tenant's
   * Apex credentials). Unused for browser-direct calls to Apex.
   */
  tenantKey?: string;
  /** Base URL to the Apex backend (must include the `/api` segment). */
  apiBaseUrl: string;
  /** Inject a fetch implementation — useful for tests / SSR. */
  fetch?: FetchLike;
}

export interface EmbedApiClient {
  composeSurvey(opts: {
    drugIds: string[];
    templateId?: string;
    mode?: 'initial' | 'refill';
  }): Promise<V2ComposedSurvey>;

  composeSurveyByToken(token: string): Promise<{
    composed: V2ComposedSurvey;
    patientInfo: PatientInfo;
    memberId: string;
    mode: 'initial' | 'refill';
  }>;

  checkQualification(body: {
    drugIds?: string[];
    templateId?: string;
    mode?: 'initial' | 'refill';
    token?: string;
    answers: V2Answer[];
  }): Promise<V2QualificationResult>;

  submitSurvey(body: {
    drugIds?: string[];
    templateId?: string;
    mode?: 'initial' | 'refill';
    token?: string;
    answers: V2Answer[];
    patientInfo: PatientInfo;
  }): Promise<V2SubmitResult>;

  selectDrug(responseId: string, drugId: string): Promise<void>;
}

export function createEmbedApiClient(opts: EmbedApiClientOptions): EmbedApiClient {
  const baseUrl = opts.apiBaseUrl.replace(/\/+$/, '');
  const fetchImpl: FetchLike = opts.fetch ?? fetch;

  async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    init: { query?: Record<string, string | string[]>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(
      baseUrl + path,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
    );
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
        else url.searchParams.set(k, v);
      }
    }
    const res = await fetchImpl(url.toString(), {
      method,
      headers: {
        ...(opts.publishableKey ? { 'x-apex-publishable-key': opts.publishableKey } : {}),
        ...(opts.tenantKey ? { 'X-Tenant-Key': opts.tenantKey } : {}),
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* non-JSON / empty body */
    }
    if (!res.ok) {
      const msg = (parsed as { error?: string })?.error || `HTTP ${res.status}`;
      throw new EmbedApiError(res.status, msg, parsed);
    }
    return parsed as T;
  }

  return {
    composeSurvey({ drugIds, templateId, mode }) {
      const query: Record<string, string | string[]> = { drugIds: drugIds.join(',') };
      if (templateId) query.templateId = templateId;
      if (mode) query.mode = mode;
      return request('GET', '/v2/embed/surveys', { query });
    },
    composeSurveyByToken(token) {
      return request('GET', '/v2/embed/surveys/by-token', { query: { token } });
    },
    checkQualification(body) {
      return request('POST', '/v2/embed/surveys/check-qualification', { body });
    },
    submitSurvey(body) {
      return request('POST', '/v2/embed/surveys/responses', { body });
    },
    selectDrug(responseId, drugId) {
      return request('POST', `/v2/embed/surveys/responses/${responseId}/select-drug`, {
        body: { drugId },
      });
    },
  };
}
