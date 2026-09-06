import { useEffect, useMemo, useState } from 'react'
import { Check, Clock, ExternalLink, XCircle } from 'lucide-react'
import type { Provider } from '@/types'
import { useI18n } from '@/i18n'
import { licenceUrl } from '@/services/data/catalogue'
import { fetchPendingProviderChanges, reviewProviderChange } from '@/services/data/ownerProfile'
import type { ProviderProfileChangeRow } from '@/services/supabase/schema'
import { useStore } from '@/store/AppStore'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { Button, Card, Field, Modal, Notice, Textarea } from '@/components/ui'

/**
 * Campaign owners who have proposed a change to their verified details.
 *
 * This queue exists because of a hole rather than a feature request. An
 * approved company could edit its own row directly: `providers_update_own`
 * allowed the update and the guard reverted only the verification flag, so the
 * legal name, the commercial registration, the permit number and the permit
 * document could all be replaced while the "Verified by NASEK" badge stayed put.
 * A badge that survives its own evidence being swapped is worth nothing.
 *
 * `guard_provider_privileges` now refuses those columns to an owner outright,
 * and `submit_provider_profile` records the proposal here instead. Which makes
 * this screen the second half of that fix: without somewhere for a change to be
 * read, closing the hole would simply have meant owners could never correct a
 * mistyped permit number.
 *
 * The comparison is what the screen is for. "Now" is the information NASEK
 * approved; "proposed" is what the owner is asking for; and the new permit, if
 * there is one, opens through a signed URL exactly as the original does — the
 * bucket is private and nothing here changes that.
 */
export function OwnerChangesPanel({ providers }: { providers: Provider[] }) {
  const { t, bl, date } = useI18n()
  const { toast } = useStore()
  const { reload } = useSnapshotLoader()

  const [rows, setRows] = useState<ProviderProfileChangeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refusing, setRefusing] = useState<ProviderProfileChangeRow | null>(null)
  const [reason, setReason] = useState('')
  const [deciding, setDeciding] = useState(false)

  const companyOf = useMemo(() => {
    const map = new Map(providers.map((p) => [p.id, p]))
    return (id: string) => map.get(id)
  }, [providers])

  const load = async () => {
    setLoading(true)
    setRows(await fetchPendingProviderChanges())
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  /**
   * Approve or refuse, then re-read both lists.
   *
   * `review_provider_changes` applies the new values to the company, marks the
   * change, writes the audit entry, notifies the owner and queues their email —
   * all in one transaction. So there are two things stale afterwards: this
   * queue, and the catalogue snapshot the rest of the dashboard draws companies
   * from. Both are re-read rather than patched, because the database is the one
   * that knows what actually landed.
   */
  const decide = async (change: ProviderProfileChangeRow, approve: boolean, why?: string) => {
    setDeciding(true)
    const outcome = await reviewProviderChange(change.id, approve, why)
    setDeciding(false)

    if (!outcome.ok) {
      toast(outcome.error, 'warning')
      return
    }

    const company = companyOf(change.provider_id)
    toast(
      approve
        ? t('admin.ownerChangeApproved', { name: bl(company?.name) })
        : t('admin.ownerChangeRejected', { name: bl(company?.name) }),
      approve ? 'success' : 'info',
    )
    setRefusing(null)
    setReason('')
    await load()
    await reload()
  }

  if (loading) return null
  if (rows.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3 rounded-[3px] border border-gold-300 bg-gold-50 px-4 py-3">
        <Clock className="mt-0.5 size-4 shrink-0 text-gold-700" />
        <div>
          <p className="text-sm font-bold text-gold-900">
            {t('admin.ownerChangesTitle')}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-gold-800/80">
            {t('admin.ownerChangesBody')}
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {rows.map((change) => {
          const company = companyOf(change.provider_id)
          return (
            <li key={change.id}>
              <Card className="p-5">
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-md font-bold text-ink-900">
                    {bl(company?.name) || change.provider_id}
                  </h3>
                  <span className="text-2xs text-ink-400">
                    {t('admin.campaignSubmitted')} · {date(change.created_at)}
                  </span>
                </header>

                <ChangeTable change={change} company={company} />

                <div className="mt-4 flex flex-wrap gap-2 border-t border-ivory-300 pt-4">
                  <Button
                    size="xs"
                    variant="approve"
                    disabled={deciding}
                    onClick={() => void decide(change, true)}
                  >
                    <Check className="size-3.5" />
                    {t('admin.ownerChangeApprove')}
                  </Button>
                  <Button
                    size="xs"
                    variant="danger"
                    disabled={deciding}
                    onClick={() => {
                      setRefusing(change)
                      setReason('')
                    }}
                  >
                    <XCircle className="size-3.5" />
                    {t('admin.ownerChangeReject')}
                  </Button>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>

      {/*
        A refusal needs a reason, enforced by the database and collected here.

        The owner reads this text word for word on their own profile screen and
        corrects the submission against it, so it is written to be read by them
        rather than filed.
      */}
      <Modal
        open={!!refusing}
        onClose={() => setRefusing(null)}
        title={t('admin.ownerChangeRejectTitle')}
      >
        {refusing && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-600">
              {t('admin.ownerChangeRejectBody')}
            </p>
            <Field label={t('admin.campaignRejectReason')} required>
              {(p) => (
                <Textarea
                  {...p}
                  rows={4}
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setRefusing(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={deciding}
                disabled={!reason.trim()}
                onClick={() => void decide(refusing, false, reason.trim())}
              >
                {t('admin.ownerChangeReject')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}

/**
 * Now, and what is proposed, side by side.
 *
 * A diff rather than a form. An administrator is deciding whether a specific
 * change is legitimate, and the only way to do that is to see what it is
 * changing *from* — a screen showing just the new values would be asking them
 * to remember the company's registration number.
 */
function ChangeTable({
  change,
  company,
}: {
  change: ProviderProfileChangeRow
  company?: Provider
}) {
  const { t, date } = useI18n()
  const [permit, setPermit] = useState<'idle' | 'opening' | 'failed'>('idle')

  const LABEL: Record<string, string> = {
    name: t('auth.companyName'),
    commercial_registration: t('owner.commercialRegistration'),
    permit_number: t('owner.permitNumber'),
    permit_expiry: t('owner.permitExpiry'),
  }

  const CURRENT: Record<string, string | undefined> = {
    name: company?.name.en || company?.name.ar,
    commercial_registration: company?.commercialRegistration,
    permit_number: company?.permitNumber,
    permit_expiry: company?.permitExpiry ? date(company.permitExpiry) : undefined,
  }

  const entries = Object.entries(change.proposed).filter(([key]) => key !== 'licence_path')

  const open = async () => {
    if (!change.licence_path) return
    setPermit('opening')
    const url = await licenceUrl(change.licence_path)
    if (!url) {
      setPermit('failed')
      return
    }
    setPermit('idle')
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="mt-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-lg text-sm">
          <thead>
            <tr className="border-b border-ivory-300 text-2xs uppercase tracking-[0.12em] text-ink-400">
              <th className="p-2 text-start font-bold">{t('admin.ownerChangeField')}</th>
              <th className="p-2 text-start font-bold">{t('admin.ownerChangeNow')}</th>
              <th className="p-2 text-start font-bold">{t('admin.ownerChangeProposed')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key} className="border-b border-ivory-200 last:border-0">
                <td className="p-2 font-semibold text-ink-700">{LABEL[key] ?? key}</td>
                <td className="p-2 text-ink-500 line-through decoration-ink-300">
                  {CURRENT[key] || '—'}
                </td>
                <td className="p-2 font-semibold text-nasek-800">
                  {key === 'permit_expiry' && value ? date(value) : value || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {change.licence_path && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[3px] border border-ivory-300 bg-ivory-50 px-3 py-2.5">
          <span className="text-2xs font-bold uppercase tracking-[0.12em] text-ink-400">
            {t('admin.ownerChangePermit')}
          </span>
          <span className="text-sm font-semibold text-ink-800">
            {change.licence_file_name || t('admin.licence')}
          </span>
          <Button
            size="xs"
            variant="secondary"
            loading={permit === 'opening'}
            onClick={() => void open()}
          >
            <ExternalLink className="size-3.5" />
            {t('admin.viewLicence')}
          </Button>
          {permit === 'failed' && (
            <Notice tone="danger" live className="w-full">
              {t('owner.permitFailed')}
            </Notice>
          )}
        </div>
      )}
    </div>
  )
}
