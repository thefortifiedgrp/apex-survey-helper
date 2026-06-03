import { describe, it, expect, vi } from 'vitest';
import { createEmbedApiClient, EmbedApiError } from './api';

function makeFetchMock(response: Partial<Response> & { jsonBody?: unknown }) {
  return vi.fn(async () => {
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.jsonBody,
    } as any;
  });
}

describe('createEmbedApiClient', () => {
  it('uses the injected fetch — does not touch global', async () => {
    const fetchMock = makeFetchMock({ ok: true, status: 200, jsonBody: { sections: [] } });
    const client = createEmbedApiClient({
      publishableKey: 'pk_test',
      apiBaseUrl: 'http://api.example.test/api',
      fetch: fetchMock as any,
    });
    await client.composeSurvey({ drugIds: ['drug-A'] });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('attaches x-apex-publishable-key header on every request', async () => {
    const fetchMock = makeFetchMock({ ok: true, jsonBody: {} });
    const client = createEmbedApiClient({
      publishableKey: 'pk_abc',
      apiBaseUrl: 'http://api.example.test/api',
      fetch: fetchMock as any,
    });
    await client.composeSurvey({ drugIds: ['drug-A'] });
    const init = (fetchMock.mock.calls as any[])[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-apex-publishable-key']).toBe('pk_abc');
  });

  it('builds the correct URL + query for composeSurvey', async () => {
    const fetchMock = makeFetchMock({ ok: true, jsonBody: {} });
    const client = createEmbedApiClient({
      publishableKey: 'pk',
      apiBaseUrl: 'http://api.example.test/api',
      fetch: fetchMock as any,
    });
    await client.composeSurvey({ drugIds: ['drug-A', 'drug-B'], templateId: 'tpl-1', mode: 'refill' });
    const url = (fetchMock.mock.calls as any[])[0][0] as string;
    expect(url).toContain('/v2/embed/surveys');
    expect(url).toContain('drugIds=drug-A%2Cdrug-B');
    expect(url).toContain('templateId=tpl-1');
    expect(url).toContain('mode=refill');
  });

  it('POST endpoints send JSON body + Content-Type header', async () => {
    const fetchMock = makeFetchMock({ ok: true, jsonBody: { qualified: true, drugResults: [] } });
    const client = createEmbedApiClient({
      publishableKey: 'pk',
      apiBaseUrl: 'http://api.example.test/api',
      fetch: fetchMock as any,
    });
    await client.checkQualification({ drugIds: ['drug-A'], answers: [{ questionId: 'q', value: 'v' }] });
    const init = (fetchMock.mock.calls as any[])[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string).answers).toEqual([{ questionId: 'q', value: 'v' }]);
  });

  it('throws EmbedApiError with the server error message on non-2xx', async () => {
    const fetchMock = makeFetchMock({ ok: false, status: 403, jsonBody: { error: 'Origin not allowed' } });
    const client = createEmbedApiClient({
      publishableKey: 'pk',
      apiBaseUrl: 'http://api.example.test/api',
      fetch: fetchMock as any,
    });
    await expect(client.composeSurvey({ drugIds: ['x'] })).rejects.toBeInstanceOf(EmbedApiError);
    try {
      await client.composeSurvey({ drugIds: ['x'] });
    } catch (e) {
      const err = e as EmbedApiError;
      expect(err.status).toBe(403);
      expect(err.message).toBe('Origin not allowed');
      expect((err.body as any).error).toBe('Origin not allowed');
    }
  });

  it('trims trailing slashes off apiBaseUrl', async () => {
    const fetchMock = makeFetchMock({ ok: true, jsonBody: {} });
    const client = createEmbedApiClient({
      publishableKey: 'pk',
      apiBaseUrl: 'http://api.example.test/api//',
      fetch: fetchMock as any,
    });
    await client.composeSurvey({ drugIds: ['x'] });
    const url = (fetchMock.mock.calls as any[])[0][0] as string;
    expect(url).not.toContain('//v2');
  });
});
