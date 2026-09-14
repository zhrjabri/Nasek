import type { Provider, Campaign, Lang, SearchFilters, ServiceKey, TravelMethod, CampaignType } from '@/types'

/** One thing the natural-language parser extracted from a user's sentence. */
export interface ParsedFacet {
  /** Which filter this maps onto. */
  field: keyof SearchFilters | 'dateRange'
  /** Human-readable label, in the user's language. */
  label: string
  /** The literal text in the query that produced it — shown as evidence. */
  evidence: string
  /** 0–1. Below 0.6 the UI shows the chip as "probably". */
  confidence: number
}

export interface NLSearchResult {
  filters: Partial<SearchFilters>
  facets: ParsedFacet[]
  /** True when nothing at all could be extracted. */
  empty: boolean
}

/** The seven answers collected by the Smart Match questionnaire. */
export interface SmartMatchInput {
  type: CampaignType | 'any'
  wilayahId: string | null
  budget: number | null
  season: SeasonKey | null
  travelMethod: TravelMethod | 'any'
  services: ServiceKey[]
  travellers: number
}

export type SeasonKey =
  | 'soon'
  | 'ramadan'
  | 'hajj_season'
  | 'winter'
  | 'spring'
  | 'any'

/** A scored campaign with the reasoning that produced the score. */
export interface MatchResult {
  campaign: Campaign
  /** 0–100. */
  score: number
  /** Why this fits — one short sentence per satisfied criterion. */
  reasons: string[]
  /** Honest downsides. Showing these is what makes the score credible. */
  tradeoffs: string[]
  /** Per-criterion breakdown, used by the score ring tooltip. */
  breakdown: { key: string; label: string; weight: number; earned: number }[]
}

/**
 * The seam between NASEK's UI and whatever produces its intelligence.
 *
 * `LocalAIProvider` (the default) implements both methods with deterministic
 * on-device logic, with no API key and no network. It is the only provider;
 * nothing in the UI names it, so another implementation could be returned from
 * `getAI()` in `services/ai/index.ts` without touching a component.
 *
 * Both methods end in campaigns a pilgrim opens one at a time. There is no
 * conversational method: the chat assistant that used to sit alongside these
 * has been removed from the product rather than left unwired.
 */
export interface AIProvider {
  readonly id: string
  /** Turn a free-text request into search filters. */
  parseSearch(query: string, lang: Lang): Promise<NLSearchResult>
  /** Rank campaigns against the questionnaire answers. */
  smartMatch(
    input: SmartMatchInput,
    lang: Lang,
    pool: Campaign[],
    providers: Provider[],
  ): Promise<MatchResult[]>
}
