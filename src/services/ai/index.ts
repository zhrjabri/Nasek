import type { Campaign, Lang } from '@/types'
import { answer } from './assistant'
import { parseNaturalQuery } from './nlSearch'
import { scoreCampaigns } from './smartMatch'
import type {
  AIProvider,
  AssistantMessage,
  NLSearchResult,
  MatchResult,
  SmartMatchInput,
} from './types'

/** Simulated latency so the UI's thinking states are real, not decorative. */
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * The default provider: everything runs on-device, deterministically.
 * No API key, no network, no per-request cost — and identical output for the
 * same input, which is what a demo in front of stakeholders needs.
 */
export const LocalAIProvider: AIProvider = {
  id: 'local',

  async parseSearch(query: string, lang: Lang): Promise<NLSearchResult> {
    await delay(650)
    return parseNaturalQuery(query, lang)
  },

  async smartMatch(input: SmartMatchInput, lang: Lang, pool: Campaign[]): Promise<MatchResult[]> {
    await delay(1400)
    return scoreCampaigns(input, lang, pool)
  },

  async ask(message: string, _history: AssistantMessage[], lang: Lang) {
    await delay(600 + Math.min(900, message.length * 12))
    return answer(message, lang)
  },
}

/**
 * The production shape: same interface, backed by a server route that calls a
 * hosted model (Claude, for example) with the campaign catalogue as context.
 *
 * It is deliberately not wired up. Swapping providers is a one-line change in
 * `getAI()` below — but the key must live on the server, never in this bundle,
 * so this class expects a `/api/ai/*` route to exist first. Everything else in
 * the app is already written against `AIProvider` and needs no changes.
 */
export class RemoteAIProvider implements AIProvider {
  readonly id = 'remote'

  constructor(private readonly baseUrl = '/api/ai') {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`NASEK AI request failed: ${res.status}`)
    return (await res.json()) as T
  }

  parseSearch(query: string, lang: Lang) {
    return this.post<NLSearchResult>('/search', { query, lang })
  }

  smartMatch(input: SmartMatchInput, lang: Lang, pool: Campaign[]) {
    return this.post<MatchResult[]>('/match', {
      input,
      lang,
      campaignIds: pool.map((c) => c.id),
    })
  }

  ask(message: string, history: AssistantMessage[], lang: Lang) {
    return this.post<Pick<AssistantMessage, 'text' | 'campaignIds' | 'suggestions'>>('/ask', {
      message,
      lang,
      history: history.slice(-8).map(({ role, text }) => ({ role, text })),
    })
  }
}

let active: AIProvider = LocalAIProvider

/** The single accessor every component uses. Nothing imports a provider directly. */
export const getAI = (): AIProvider => active

/** Swap the intelligence layer at runtime (used by tests and future config). */
export const setAI = (provider: AIProvider) => {
  active = provider
}

export type { AIProvider, MatchResult, SmartMatchInput, AssistantMessage, NLSearchResult }
export { EXAMPLE_QUERIES } from './nlSearch'
export { SEASON_WINDOWS } from './smartMatch'
export { defaultSuggestions } from './assistant'
