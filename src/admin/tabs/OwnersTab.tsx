import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  Ban,
  Building2,
  FileImage,
  ShieldCheck,
  ShieldX,
  UserPlus,
  XCircle,
} from 'lucide-react'
import { isPendingProvider, type Provider, type VerificationStatus } from '@/types'
import { useI18n, type MessageKey } from '@/i18n'
import { wilayahName } from '@/data/geo'
import { licenceUrl, setProviderVerification } from '@/services/data/catalogue'
import { useSnapshotLoader } from '@/hooks/useRemoteData'
import { useStore } from '@/store/AppStore'
import { Badge, Button, EmptyState, Field, Modal, Rating, Spinner, Textarea } from '@/components/ui'
import { BodyRow, HeadRow, Kpi, TableShell, Th, Toolbar, useCountLabel } from './shared'
import { NewOwnerDialog } from './NewOwnerDialog'
import { OwnerChangesPanel } from './OwnerChangesPanel'

type Filter = 'all' | 'pending' | 'verified' | 'rejected' | 'suspended'

/**
 * Campaign owner management — the verification queue.
 *
 * Verification is the decision that matters here, and it is never made blind:
 * the permit the owner uploaded is one click from the button, because a
 * verification badge granted without looking at the licence is worth nothing to
 * the pilgrim who trusts it.
 *
 * What changed, and why it was worth changing. There used to be one control —
 * verify / unverify — which meant an application that had been read and refused
 * went back into exactly the state of one that had never been read. Nobody
 * could tell the two apart: not the administrator working the queue, who saw
 * the same row come round again, and least of all the owner, who was told
 * nothing at all and had no idea what to fix. A refusal now has its own state
 * and carries a reason the owner reads verbatim, and the database will not
 * accept one without it.
 */
export function OwnersTab({ providers }: { providers: Provider[] }) {
  const { t, lang, bl, n, date } = useI18n()
  const { dispatch, toast } = useStore()
  const { reload } = useSnapshotLoader()
  const countLabel = useCountLabel()

  const [query, setQuery] = useState('')
  // Opens on the queue. The full directory is a reference you go to; the
  // applications waiting on a decision are the reason this screen exists.
  const [filter, setFilter] = useState<Filter>('pending')
  const [permit, setPermit] = useState<Provider | null>(null)
  const [refusing, setRefusing] = useState<{ provider: Provider; status: 'rejected' | 'suspended' } | null>(null)
  /*
   * Adding one, which is now the only way a company gets onto NASEK.
   *
   * The public registration form is gone: an owner does not apply, NASEK takes
   * them on. That makes this screen the start of the relationship rather than
   * the middle of it, so the button belongs at the top of it.
   */
  const [adding, setAdding] = useState(false)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return providers.filter((p) => {
      if (filter === 'pending' && !isPendingProvider(p.verification)) return false
      if (filter === 'verified' && p.verification !== 'verified') return false
      if (filter === 'rejected' && p.verification !== 'rejected') return false
      if (filter === 'suspended' && p.verification !== 'suspended') return false
      if (!needle) return true
      return (
        bl(p.name).toLowerCase().includes(needle) ||
        p.email.toLowerCase().includes(needle) ||
        p.phone.includes(needle)
      )
    })
  }, [providers, filter, query, bl])

  const waiting = providers.filter((p) => isPendingProvider(p.verification)).length
  const approved = providers.filter((p) => p.verification === 'verified').length
  const refused = providers.filter((p) => p.verification === 'rejected').length

  /**
   * Write the decision, then reflect it.
   *
   * Written to the database first and to the store second, and only if the
   * database agreed. The old order — update the interface, fire the request,
   * ignore the answer — is what let a browser show a company as verified while
   * Postgres had refused the update, and there is no way back from that except
   * a reload nobody knew to do.
   */
  const decide = async (p: Provider, status: VerificationStatus, reason?: string) => {
    const result = await setProviderVerification(p.id, status, reason)
    if (!result.ok) {
      toast(result.error, 'warning')
      return false
    }
    dispatch({ type: 'setVerification', providerId: p.id, status })
    toast(t(TOAST[status] ?? 'admin.unverifiedToast', { name: bl(p.name) }),
      status === 'verified' ? 'success' : 'info')
    /*
     * Re-read, because the dispatch above no longer reaches this table.
     *
     * `verificationOverrides` is consulted only when there is no database.
     * Once a snapshot has landed, `useCatalogue` returns the server's providers
     * untouched — correctly, so that one browser's stale opinion cannot outrank
     * the platform's — which meant the decision was written, acknowledged, and
     * then not drawn. The administrator saw an unchanged badge and clicked
     * again.
     */
    await reload()
    return true
  }

  return (
    <section className="space-y-5">
      {/*
        The three states, named as states rather than as a total and two
        subsets. "12 owners, 9 verified" leaves the reader doing the subtraction
        that matters — how many are waiting — which is the only figure on this
        screen that represents work.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-900">{t('admin.providers')}</h2>
          <p className="text-sm text-ink-500">{t('admin.newOwnerBody')}</p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <UserPlus className="size-4" />
          {t('admin.newOwnerButton')}
        </Button>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={t('admin.ownersPendingTitle')}
          value={n(waiting)}
          icon={<ShieldCheck className="size-4" />}
          tone={waiting > 0 ? 'alert' : undefined}
          hint={waiting > 0 ? t('admin.ownersPendingHint') : undefined}
        />
        <Kpi
          label={t('admin.ownersApprovedTitle')}
          value={n(approved)}
          icon={<BadgeCheck className="size-4" />}
        />
        <Kpi
          label={t('admin.ownersRejectedTitle')}
          value={n(refused)}
          icon={<XCircle className="size-4" />}
        />
        <Kpi
          label={t('admin.kpiProviders')}
          value={n(providers.length)}
          icon={<Building2 className="size-4" />}
        />
      </ul>

      {/*
        Proposed changes to verified details, above the directory.

        Renders nothing when the queue is empty, which is most of the time —
        so it costs an administrator no attention until there is something to
        pay attention to, and is impossible to miss when there is.
      */}
      <OwnerChangesPanel providers={providers} />

      <Toolbar<Filter>
        query={query}
        onQuery={setQuery}
        placeholder={t('admin.ownerSearch')}
        filter={filter}
        onFilter={setFilter}
        filterLabel={t('admin.ownerFilter')}
        count={countLabel(visible.length, providers.length)}
        options={[
          // Same order as the campaign queue, and for the same reason: the
          // lifecycle reads as a pipeline rather than as an alphabetised set of
          // flags, and the two screens teach the same shape.
          { value: 'pending', label: t('admin.ownersPendingTitle') },
          { value: 'verified', label: t('admin.ownersApprovedTitle') },
          { value: 'rejected', label: t('admin.ownersRejectedTitle') },
          { value: 'suspended', label: t('admin.suspendedFilter') },
          { value: 'all', label: t('admin.filterAll') },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title={providers.length === 0 ? t('admin.noProviders') : t('admin.noOwnerMatch')}
          body={providers.length === 0 ? t('admin.newOwnerNoneBody') : t('admin.noUsersBody')}
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
                <Th>{t('provider.verificationLabel')}</Th>
                <Th end>{t('admin.userActions')}</Th>
              </HeadRow>
            </thead>
            <tbody>
              {visible.map((p) => {
                const verified = p.verification === 'verified'
                const hasPermit = !!(p.licencePath || p.licenceImage)
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
                      {hasPermit ? (
                        <Button size="xs" variant="secondary" onClick={() => setPermit(p)}>
                          <FileImage className="size-3.5" />
                          {t('admin.viewLicence')}
                        </Button>
                      ) : (
                        <span className="text-xs text-ink-400">{t('admin.noLicence')}</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <StatusBadge status={p.verification} />
                    </td>
                    <td className="p-3.5">
                      <div className="flex flex-wrap justify-end gap-2">
                        {/*
                          Not for a suspended company, which already has
                          "Restore" at the end of this row.

                          Both controls called `decide(p, 'verified')` — the
                          same decision, in the same row, under two different
                          words — so a suspended company offered an
                          administrator a choice that was not one, and the two
                          labels disagreed about what was happening. "Restore"
                          is the true one: the company was approved before, and
                          this puts it back.
                        */}
                        {!verified && p.verification !== 'suspended' && (
                          <Button size="xs" variant="approve" onClick={() => void decide(p, 'verified')}>
                            <BadgeCheck className="size-3.5" />
                            {t('admin.approve')}
                          </Button>
                        )}
                        {p.verification !== 'rejected' && !verified && (
                          <Button
                            size="xs"
                            variant="danger"
                            onClick={() => setRefusing({ provider: p, status: 'rejected' })}
                          >
                            <XCircle className="size-3.5" />
                            {t('admin.reject')}
                          </Button>
                        )}
                        {verified && (
                          <>
                            <Button
                              size="xs"
                              variant="danger"
                              onClick={() => void decide(p, 'pending')}
                            >
                              <ShieldX className="size-3.5" />
                              {t('admin.unverify')}
                            </Button>
                            <Button
                              size="xs"
                              variant="danger"
                              onClick={() => setRefusing({ provider: p, status: 'suspended' })}
                            >
                              <Ban className="size-3.5" />
                              {t('admin.suspend')}
                            </Button>
                          </>
                        )}
                        {p.verification === 'suspended' && (
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={() => void decide(p, 'verified')}
                          >
                            {t('admin.restore')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </BodyRow>
                )
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      {/* ------------------------------------------------------- the permit */}
      <Modal
        open={!!permit}
        onClose={() => setPermit(null)}
        title={permit ? bl(permit.name) : t('admin.licence')}
        wide
      >
        {permit && (
          <div className="space-y-4">
            <PermitImage provider={permit} />

            {/*
              What the permit is checked *against*.

              This dialog used to show a scan, the years of trading and a join
              date — which is enough to look at a licence and not enough to
              verify one. There was no number to compare with the number printed
              on the document, no expiry to notice had passed, no commercial
              registration and no address. An administrator was being asked to
              grant the badge NASEK's whole proposition rests on with nothing but
              a photograph.
            */}
            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <PermitFact label={t('admin.ownerPermitNumber')} value={permit.permitNumber} ltr />
              <div>
                <dt className="text-2xs font-bold uppercase tracking-wider text-ink-400">
                  {t('admin.ownerPermitExpiry')}
                </dt>
                <dd className="mt-1 flex items-center gap-2 text-sm text-ink-800">
                  {permit.permitExpiry ? date(permit.permitExpiry) : '—'}
                  {/* Flagged, never enforced. A renewal in progress is a
                      conversation, and refusing the application automatically
                      would mean it never reaches the person who could have it. */}
                  {permit.permitExpiry &&
                    permit.permitExpiry < new Date().toISOString().slice(0, 10) && (
                      <Badge tone="red">{t('admin.ownerPermitExpired')}</Badge>
                    )}
                </dd>
              </div>
              <PermitFact
                label={t('admin.ownerCommercialRegistration')}
                value={permit.commercialRegistration}
                ltr
              />
              <PermitFact label={t('admin.ownerGovernorate')} value={permit.governorate} />
              <PermitFact
                label={t('common.wilayah')}
                value={wilayahName(permit.wilayahId, lang)}
              />
              <PermitFact label={t('common.phone')} value={permit.phone} ltr />
              <PermitFact label={t('common.email')} value={permit.email} ltr />
              <div>
                <dt className="text-2xs font-bold uppercase tracking-wider text-ink-400">
                  {t('common.experience').replace('{n}', '').trim()}
                </dt>
                <dd className="nums mt-1 text-sm text-ink-800">{n(permit.experienceYears)}</dd>
              </div>
              <PermitFact label={t('admin.ownerAddress')} value={permit.address} wide />
              <PermitFact label={t('owner.description')} value={bl(permit.description)} wide />
              <div>
                <dt className="text-2xs font-bold uppercase tracking-wider text-ink-400">
                  {t('admin.userJoined')}
                </dt>
                <dd className="mt-1 text-sm text-ink-800">{date(permit.joinedAt)}</dd>
              </div>
              {permit.submittedAt && (
                <div>
                  <dt className="text-2xs font-bold uppercase tracking-wider text-ink-400">
                    {t('prov.submittedOn')}
                  </dt>
                  <dd className="mt-1 text-sm text-ink-800">{date(permit.submittedAt)}</dd>
                </div>
              )}
              {permit.licenceFileName && (
                <div className="sm:col-span-2">
                  <dt className="text-2xs font-bold uppercase tracking-wider text-ink-400">
                    {t('admin.licence')}
                  </dt>
                  <dd className="mt-1 text-xs text-ink-500">{permit.licenceFileName}</dd>
                </div>
              )}
            </dl>

            {/* A company that registered before these fields existed is not a
                broken row and should not read as one — but the reviewer has to
                know that the blanks are missing history rather than an
                application somebody submitted half-finished. */}
            {!permit.permitNumber && !permit.address && (
              <p className="rounded-[3px] border border-ivory-300 bg-ivory-50 p-3 text-xs text-ink-500">
                {t('admin.ownerIncomplete')}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-ivory-300 pt-4">
              {permit.verification !== 'verified' && (
                <Button
                  size="sm"
                  variant="approve"
                  onClick={async () => {
                    if (await decide(permit, 'verified')) setPermit(null)
                  }}
                >
                  <BadgeCheck className="size-3.5" />
                  {/* The same decision the table draws, under the same word.
                      Putting a company back is a restoration; only a company
                      that has never been approved is approved. */}
                  {t(permit.verification === 'suspended' ? 'admin.restore' : 'admin.approve')}
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setRefusing({
                    provider: permit,
                    status: permit.verification === 'verified' ? 'suspended' : 'rejected',
                  })
                  setPermit(null)
                }}
              >
                <XCircle className="size-3.5" />
                {permit.verification === 'verified' ? t('admin.suspend') : t('admin.reject')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <NewOwnerDialog open={adding} onClose={() => setAdding(false)} />

      {/* -------------------------------------------------------- the reason */}
      <RefusalDialog
        request={refusing}
        onClose={() => setRefusing(null)}
        onConfirm={async (reason) => {
          if (!refusing) return
          if (await decide(refusing.provider, refusing.status, reason)) setRefusing(null)
        }}
      />
    </section>
  )
}

const TOAST: Partial<Record<VerificationStatus, MessageKey>> = {
  verified: 'admin.verifiedToast',
  pending: 'admin.unverifiedToast',
  rejected: 'admin.rejectedToast',
  suspended: 'admin.suspendedToast',
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  const { t } = useI18n()
  if (status === 'verified') return <Badge tone="green">{t('admin.verified')}</Badge>
  if (status === 'rejected') return <Badge tone="red">{t('admin.rejected')}</Badge>
  if (status === 'suspended') return <Badge tone="red">{t('admin.suspendedFilter')}</Badge>
  return <Badge tone="amber">{t('common.pendingVerification')}</Badge>
}

/**
 * The permit itself.
 *
 * Two eras of storage meet here. A row registered since the private bucket
 * carries an object path, and the image is fetched through a signed URL minted
 * for this view and valid for ten minutes — there is no permanent URL to leak,
 * because the bucket refuses unsigned reads. An older row carries a base64 data
 * URL on the row itself, which renders directly.
 *
 * The signing happens on open rather than with the table, so a page of thirty
 * companies does not mint thirty URLs to documents nobody looked at.
 */
/**
 * One fact from the application, with an em dash where there is nothing.
 *
 * A dash rather than an empty cell, because on this screen the difference
 * between "they did not give us a registration number" and "the layout has a
 * gap here" is a decision an administrator is about to take.
 */
function PermitFact({
  label,
  value,
  ltr,
  wide,
}: {
  label: string
  value?: string
  ltr?: boolean
  wide?: boolean
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-2xs font-bold uppercase tracking-wider text-ink-400">{label}</dt>
      <dd
        dir={ltr ? 'ltr' : undefined}
        className={value ? 'mt-1 text-sm text-ink-800' : 'mt-1 text-sm text-ink-400'}
      >
        {value || '—'}
      </dd>
    </div>
  )
}

function PermitImage({ provider }: { provider: Provider }) {
  const { t } = useI18n()
  const [src, setSrc] = useState<string | null>(provider.licenceImage ?? null)
  const [loading, setLoading] = useState(!!provider.licencePath && !provider.licenceImage)

  useEffect(() => {
    if (!provider.licencePath) return
    let live = true
    setLoading(true)
    void licenceUrl(provider.licencePath).then((url) => {
      if (!live) return
      if (url) setSrc(url)
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [provider.licencePath])

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-[3px] border border-ivory-300 bg-ivory-50">
        <Spinner className="size-6 text-nasek-600" />
      </div>
    )
  }

  if (!src) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-400">
        <FileImage className="size-4" />
        {t('admin.noLicence')}
      </p>
    )
  }

  /*
   * A PDF is embedded, not rendered as an image.
   *
   * The bucket accepts PDF since `20260904000200`, because an official Omani
   * operating permit is issued as one at least as often as it is photographed —
   * and an `<img>` pointed at a PDF renders as a broken-image icon on the one
   * screen where somebody has to actually read the document. That would have
   * been a silent regression: the upload works, the row is written, the queue
   * shows an application, and the permit is unreadable.
   *
   * The MIME type comes off the row rather than the file extension, because the
   * extension is whatever the owner's phone happened to call the file. The
   * fallback matters for rows written before the column existed: those are all
   * images, so treating an unknown type as an image is right for every one of
   * them.
   */
  if (provider.licenceMime === 'application/pdf') {
    return (
      <object
        data={src}
        type="application/pdf"
        className="h-[60vh] w-full rounded-[3px] border border-ivory-300 bg-ivory-50"
        aria-label={provider.licenceFileName ?? t('admin.licence')}
      >
        {/* Some browsers refuse to embed a PDF at all. A link is not as good as
            the document on the page, and it is a great deal better than an
            empty box with no way out of it. */}
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-full items-center justify-center gap-2 text-sm font-semibold text-nasek-700 hover:underline"
        >
          <FileImage className="size-4" />
          {provider.licenceFileName ?? t('admin.licence')}
        </a>
      </object>
    )
  }

  return (
    <img
      src={src}
      alt={provider.licenceFileName ?? t('admin.licence')}
      className="max-h-[60vh] w-full rounded-[3px] border border-ivory-300 bg-ivory-50 object-contain"
    />
  )
}

/**
 * Refusing, with the reason.
 *
 * A dialog rather than an inline field because the reason is not optional — the
 * database rejects a refusal without one — and because it is the only thing on
 * this screen an owner will ever read. It is worth a moment's attention and a
 * box big enough to write a sentence in.
 */
function RefusalDialog({
  request,
  onClose,
  onConfirm,
}: {
  request: { provider: Provider; status: 'rejected' | 'suspended' } | null
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const { t, bl } = useI18n()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Cleared per company, so a reason written for one is never sent about
  // another after the dialog is reopened.
  useEffect(() => {
    setReason('')
    setError('')
  }, [request?.provider.id, request?.status])

  const suspending = request?.status === 'suspended'

  return (
    <Modal
      open={!!request}
      onClose={onClose}
      title={
        request
          ? `${suspending ? t('admin.suspend') : t('admin.reject')} — ${bl(request.provider.name)}`
          : ''
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-600">
          {t(suspending ? 'admin.suspendBody' : 'admin.rejectBody')}
        </p>

        <Field label={t('admin.reasonLabel')} hint={t('admin.reasonHint')} required error={error}>
          {(p) => (
            <Textarea
              {...p}
              rows={4}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                setError('')
              }}
            />
          )}
        </Field>

        <div className="flex justify-end gap-2 border-t border-ivory-300 pt-4">
          <Button size="sm" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            loading={busy}
            onClick={async () => {
              if (!reason.trim()) {
                setError(t('admin.reasonRequired'))
                return
              }
              setBusy(true)
              await onConfirm(reason.trim())
              setBusy(false)
            }}
          >
            {suspending ? t('admin.suspend') : t('admin.reject')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
