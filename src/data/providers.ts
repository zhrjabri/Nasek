import type { Provider } from '@/types'

/**
 * The campaign providers. Empty — the nine fictional demo companies were
 * removed along with their campaigns and reviews.
 */
export const PROVIDERS: Provider[] = []

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id)
