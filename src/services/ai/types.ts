import type { Campaign, Lang, SearchFilters, ServiceKey, TravelMethod, CampaignType } from '@/types'

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

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Campaigns the assistant is pointing at, rendered as mini cards. */
  campaignIds?: string[]
  /** Follow-up chips offered under the reply. */
  suggestions?: string[]
  pending?: boolean
}

/**
 * The seam between NASEK's UI and whatever produces its intelligence.
 *
 * `LocalAIProvider` (the default) implements all three methods with
 * deterministic on-device logic, so the prototype works with no API key and
 * no network. `RemoteAIProvider` implements the same interface against a
 * server route that calls a hosted model. Nothing in the UI knows which is
 * active — swap them in `services/ai/index.ts`.
 */
export interface AIProvider {
  readonly id: string
  /** Turn a free-text request into search filters. */
  parseSearch(query: string, lang: Lang): Promise<NLSearchResult>
  /** Rank campaigns against the questionnaire answers. */
  smartMatch(input: SmartMatchInput, lang: Lang, pool: Campaign[]): Promise<MatchResult[]>
  /** Answer a question about the platform and its campaigns. */
  ask(
    message: string,
    history: AssistantMessage[],
    lang: Lang,
  ): Promise<Pick<AssistantMessage, 'text' | 'campaignIds' | 'suggestions'>>
}
