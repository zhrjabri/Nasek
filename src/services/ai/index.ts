import type { Campaign, Lang, Provider } from '@/types'
import { parseNaturalQuery } from './nlSearch'
import { scoreCampaigns } from './smartMatch'
import type { AIProvider, NLSearchResult, MatchResult, SmartMatchInput } from './types'

/** Simulated latency so the UI's thinking states are real, not decorative. */
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * The default provider: everything runs on-device, deterministically.
 * No API key, no network, no per-request cost — and identical output for the
 * same input, which is what a demo in front of stakeholders needs.
 *
 * Two capabilities, not three. There was a conversational assistant here as
 * well; it is gone, along with the chat window it fed. Both remaining methods
 * end in a list of campaigns the pilgrim can open, which is the only thing
 * this layer is for.
 */
export const LocalAIProvider: AIProvider = {
  id: 'local',

  async parseSearch(query: string, lang: Lang): Promise<NLSearchResult> {
    await delay(650)
    return parseNaturalQuery(query, lang)
  },

  async smartMatch(
    input: SmartMatchInput,
    lang: Lang,
    pool: Campaign[],
    providers: Provider[],
  ): Promise<MatchResult[]> {
    await delay(1400)
    return scoreCampaigns(input, lang, pool, providers)
  },
}

/** The single accessor every component uses. Nothing imports a provider directly. */
export const getAI = (): AIProvider => LocalAIProvider

export type { AIProvider, MatchResult, SmartMatchInput, NLSearchResult }
export { EXAMPLE_QUERIES } from './nlSearch'
export { SEASON_WINDOWS } from './smartMatch'
