import { useMemo, useState } from 'react'
import { BadgeCheck, Building2, FileImage, ShieldCheck, ShieldX } from 'lucide-react'
import type { Provider } from '@/types'
import { useI18n } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { setProviderVerification } from '@/services/data/catalogue'
import { useStore } from '@/store/AppStore'
import { Badge, Button, EmptyState, Modal, Rating } from '@/components/ui'
import { BodyRow, HeadRow, Kpi, TableShell, Th, Toolbar, useCountLabel } from './shared'

type Filter = 'all' | 'pending' | 'verified'

/**
 * Campaign owner management.
 *
 * Verification is the decision that matters here, and it is never made blind:
 * the permit the owner uploaded sits in the same row as the button, because a
 * verification badge granted without looking at the licence is worth nothing
 * to the pilgrim who trusts it.
 */
export function OwnersTab({ providers }: { providers: Provider[] }) {
  const { t, lang, bl, n, date } = useI18n()
  const { dispatch, toast } = useStore()
  const countLabel = useCountLabel()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [permit, setPermit] = useState<Provider | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return providers.filter((p) => {
      if (filter === 'pending' && p.verification === 'verified') return false
      if (filter === 'verified' && p.verification !== 'verified') return false
      if (!needle) return true
      return (
        bl(p.name).toLowerCase().includes(needle) ||
        p.email.toLowerCase().includes(needle) ||
        p.phone.includes(needle)
      )
    })
  }, [providers, filter, query, bl])

  const pending = providers.filter((p) => p.verification !== 'verified').length

  const setVerification = (p: Provider, verified: boolean) => {
    /*
     * Written to the database, where the badge becomes a fact about the
     * platform rather than about this browser. A trigger stamps who decided and
     * when into `admin_audit` — docs/DATA-MODEL.md asked for that trail and the
     * prototype only ever stored the resulting flag.
     */
    void setProviderVerification(p.id, verified ? 'verified' : 'pending')
    dispatch({
      type: 'setVerification',
      providerId: p.id,
      status: verified ? 'verified' : 'pending',
    })
    toast(
      verified
        ? t('admin.verifiedToast', { name: bl(p.name) })
        : t('admin.unverifiedToast', { name: bl(p.name) }),
      verified ? 'success' : 'info',
    )
  }

  return (
    <section className="space-y-5">
      <ul className="grid gap-4 sm:grid-cols-3">
        <Kpi label={t('admin.kpiProviders')} value={n(providers.length)} icon={<Building2 className="size-4" />} />
        <Kpi
          label={t('admin.ownersVerified')}
          value={n(providers.length - pending)}
          icon={<BadgeCheck className="size-4" />}
        />
        <Kpi
          label={t('admin.kpiPending')}
          value={n(pending)}
          icon={<ShieldCheck className="size-4" />}
          tone={pending > 0 ? 'alert' : undefined}
          hint={pending > 0 ? t('admin.ownersPendingHint') : undefined}
        />
      </ul>

      <Toolbar<Filter>
        query={query}
        onQuery={setQuery}
        placeholder={t('admin.ownerSearch')}
        filter={filter}
        onFilter={setFilter}
        filterLabel={t('admin.ownerFilter')}
        count={countLabel(visible.length, providers.length)}
        options={[
          { value: 'all', label: t('admin.userAll') },
          { value: 'pending', label: t('common.pendingVerification') },
          { value: 'verified', label: t('admin.verified') },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title={providers.length === 0 ? t('admin.noProviders') : t('admin.noOwnerMatch')}
          body={providers.length === 0 ? t('admin.noProvidersBody') : t('admin.noUsersBody')}
        />
      ) : (
        <TableShell>
          <table className="w-full min-w-4xl text-sm">
            <thead>
              <HeadRow>
                <Th>{t('admin.providers')}</Th>
                <Th>{t('common.wilayah')}</Th>
                <Th>{t('common.rating')}</Th>
                <Th>{t('prov.plan')}</Th>
                <Th>{t('admin.licence')}</Th>
                <Th>{t('compare.row.verification')}</Th>
                <Th end>{t('admin.userActions')}</Th>
              </HeadRow>
            </thead>
            <tbody>
              {visible.map((p) => {
                const verified = p.verification === 'verified'
                return (
                  <BodyRow key={p.id}>
                    <td className="max-w-56 p-3.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-[3px] text-xs font-bold text-white"
                          style={{ background: p.brandColor }}
                          aria-hidden
                        >
                          {p.initials}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink-800">
                            {bl(p.name)}
                          </span>
                          <span className="block truncate text-2xs text-ink-400" dir="ltr">
                            {p.email}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="p-3.5 text-ink-600">{wilayahName(p.wilayahId, lang)}</td>
                    <td className="p-3.5">
                      <Rating value={p.rating} count={p.reviewCount} size="sm" />
                    </td>
                    <td className="p-3.5">
                      <Badge tone={p.plan === 'premium' ? 'gold' : 'neutral'}>{p.plan}</Badge>
                    </td>
                    <td className="p-3.5">
                      {/* Opened in a dialog rather than a new tab: the image is
                          a data: URL, and browsers refuse to navigate the top
                          frame to one, so a plain link would do nothing. */}
                      {p.licenceImage ? (
                        <button
                          type="button"
                          onClick={() => setPermit(p)}
                          className="flex items-center gap-2 rounded-[3px] border border-ivory-300 bg-ivory-50 p-1.5 pe-2.5 text-xs font-semibold text-ink-600 transition-colors hover:border-nasek-700 hover:text-nasek-800"
                        >
                          <img
                            src={p.licenceImage}
                            alt={p.licenceFileName ?? t('admin.licence')}
                            className="size-8 rounded-[2px] border border-ivory-300 object-cover"
                          />
                          {t('admin.viewLicence')}
                        </button>
                      ) : (
                        <span className="text-xs text-ink-400">{t('admin.noLicence')}</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <Badge tone={verified ? 'green' : 'amber'}>
                        {verified ? t('admin.verified') : t('common.pendingVerification')}
                      </Badge>
                    </td>
                    <td className="p-3.5 text-end">
                      <Button
                        size="sm"
                        variant={verified ? 'secondary' : 'primary'}
                        onClick={() => setVerification(p, !verified)}
                      >
                        {verified ? <ShieldX className="size-3.5" /> : <BadgeCheck className="size-3.5" />}
                        {verified ? t('admin.unverify') : t('admin.verify')}
                      </Button>
                    </td>
                  </BodyRow>
                )
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      <Modal
        open={!!permit}
        onClose={() => setPermit(null)}
        title={permit ? bl(permit.name) : t('admin.licence')}
        wide
      >
        {permit && (
          <div className="space-y-4">
            {permit.licenceImage ? (
              <img
                src={permit.licenceImage}
                alt={permit.licenceFileName ?? t('admin.licence')}
                className="max-h-[60vh] w-full rounded-[3px] border border-ivory-300 bg-ivory-50 object-contain"
              />
            ) : (
              <p className="flex items-center gap-2 text-sm text-ink-400">
                <FileImage className="size-4" />
                {t('admin.noLicence')}
              </p>
            )}
            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-2xs font-bold uppercase tracking-wider text-ink-400">
                  {t('common.experience')
                    .replace('{n}', '')
                    .trim()}
                </dt>
                <dd className="nums mt-1 text-sm text-ink-800">{n(permit.experienceYears)}</dd>
              </div>
              <div>
                <dt className="text-2xs font-bold uppercase tracking-wider text-ink-400">
                  {t('admin.userJoined')}
                </dt>
                <dd className="mt-1 text-sm text-ink-800">{date(permit.joinedAt)}</dd>
              </div>
              {permit.licenceFileName && (
                <div className="sm:col-span-2">
                  <dt className="text-2xs font-bold uppercase tracking-wider text-ink-400">
                    {t('admin.licence')}
                  </dt>
                  <dd className="mt-1 text-xs text-ink-500">{permit.licenceFileName}</dd>
                </div>
              )}
            </dl>
            <div className="flex justify-end gap-2 border-t border-ivory-300 pt-4">
              <Button
                variant={permit.verification === 'verified' ? 'secondary' : 'primary'}
                onClick={() => {
                  setVerification(permit, permit.verification !== 'verified')
                  setPermit(null)
                }}
              >
                {permit.verification === 'verified' ? (
                  <ShieldX className="size-3.5" />
                ) : (
                  <BadgeCheck className="size-3.5" />
                )}
                {permit.verification === 'verified' ? t('admin.unverify') : t('admin.verify')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
