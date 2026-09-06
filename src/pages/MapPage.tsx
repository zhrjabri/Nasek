import { useState } from 'react'
import { MapPinned } from 'lucide-react'
import { useI18n } from '@/i18n'
import { WILAYAT } from '@/data/geo'
import { useCatalogue } from '@/hooks/useCatalogue'
import { OmanMap } from '@/components/map/OmanMap'
import { CampaignCard } from '@/components/campaign/CampaignCard'
import { EmptyState, RuleLink, SectionHeading } from '@/components/ui'

export function MapPage() {
  const { t, lang } = useI18n()
  const { campaigns } = useCatalogue()
  const [selected, setSelected] = useState<string | null>(null)

  const list = selected ? campaigns.filter((c) => c.wilayahId === selected) : []
  const wilayah = WILAYAT.find((w) => w.id === selected)

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeading title={t('map.title')} subtitle={t('map.subtitle')} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <OmanMap
            campaigns={campaigns}
            selectedId={selected}
            onSelect={setSelected}
            className="rounded-[3px] border border-ivory-300 bg-ivory-50 p-5"
          />
        </div>

        <section aria-live="polite">
          {!selected ? (
            <EmptyState
              icon={<MapPinned className="size-5" />}
              title={t('map.selectHint')}
              body={t('map.legend')}
            />
          ) : (
            <>
              <header className="mb-5">
                <h2 className="display text-3xl text-ink-900">
                  {t('map.campaignsIn', { name: wilayah?.name[lang] ?? '' })}
                </h2>
                <p className="mt-1.5 text-sm text-ink-400">
                  {wilayah?.governorate[lang]} ·{' '}
                  {list.length === 1 ? t('map.countOne') : t('map.count', { n: list.length })}
                </p>
              </header>

              {list.length === 0 ? (
                <EmptyState
                  title={t('map.none')}
                  body={t('map.noneHint')}
                  /* Was "list your campaign here", pointing into the owner
                     portal. A pilgrim who finds no trips in their wilayah wants
                     the other wilayat, not an invitation to start a travel
                     company. */
                  action={
                    <RuleLink to="/campaigns">{t('campaign.browse')}</RuleLink>
                  }
                />
              ) : (
                <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {list.map((c) => (
                    <CampaignCard key={c.id} campaign={c} compact />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}
