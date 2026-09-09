/**
 * A visual harness for the owner portal and the administration.
 *
 * Both applications sit behind a login, so nothing that renders them can be
 * photographed without either credentials or this. It mounts the REAL
 * components — `OwnerDashboardPage`, `CampaignsTab`, `OwnersTab`,
 * `CampaignForm` — inside the real providers, and mocks only the two things
 * that need mocking: the rows those screens read, and the fact that somebody
 * is signed in.
 *
 * What it is not: a second copy of the interface. Every button in every
 * screenshot is the same component, the same variant and the same stylesheet
 * that production serves. If a tier is wrong here it is wrong there.
 *
 * Safety, by construction rather than by promise:
 *
 *   * built with `--mode harness`, which blanks `VITE_SUPABASE_*`, so
 *     `isSupabaseConfigured` is false and no client is ever constructed;
 *   * therefore every write path returns early — there is nothing to write to;
 *   * no service-role key is read, referenced or needed;
 *   * `vite.harness.config.ts` has no `assertBackendConfigured`, because a
 *     backend is exactly what this must not have.
 *
 * Reached at `/harness.html?screen=…`. Never built by `npm run build`.
 */
import { useEffect, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider, useI18n } from '@/i18n'
import { ownerAr } from '@/i18n/ownerAr'
import { ownerEn } from '@/i18n/ownerEn'
import { adminAr } from '@/i18n/adminAr'
import { adminEn } from '@/i18n/adminEn'
import { AppStoreProvider, useStore } from '@/store/AppStore'
import { ToastHost } from '@/components/layout/ToastHost'

import { DashboardPage as OwnerDashboardPage } from '@/owner/DashboardPage'
import { OwnerShell } from '@/owner/layout/OwnerShell'
import { CampaignForm } from '@/components/campaign/CampaignForm'
import { CampaignsTab } from '@/admin/tabs/CampaignsTab'
import { OwnersTab } from '@/admin/tabs/OwnersTab'
import { OverviewTab } from '@/admin/tabs/OverviewTab'

import { ADMIN, CAMPAIGNS, OWNER, PROVIDERS, SNAPSHOT } from './fixtures'

/**
 * Seeds the store the way a real session would, then renders.
 *
 * Keyed off `remoteReady` rather than a one-shot effect, and that is not
 * defensive coding — it is the only ordering that works. A child's effects run
 * before its parent's, so a seed dispatched here lands *before*
 * `AppStoreProvider`'s own mount effect, which starts from `emptyState` and
 * lays stored values on top — wiping `remoteProviders` a moment after this set
 * them. The owner dashboard then looked up its own company, got `undefined`,
 * and `CompanyProfilePanel` crashed on `p.tagline.en`.
 *
 * Watching the flag instead means the seed re-applies after the hydrate,
 * whatever order the two happen to run in.
 */
function Seed({ as, children }: { as: 'owner' | 'admin'; children: ReactNode }) {
  const { dispatch, remoteReady, user } = useStore()

  useEffect(() => {
    /*
     * A macrotask, not the effect body, and the reason is the whole bug this
     * harness spent an afternoon on.
     *
     * A child's effects run before its parent's, so seeding here synchronously
     * lands *before* `AppStoreProvider`'s own mount effect — which starts from
     * `emptyState` and lays the persisted values on top, wiping the seed a
     * moment after it was written. Worse, it wipes it back to exactly the
     * values this effect already saw, so the dependency array does not change
     * and the effect never fires again: a screen that renders nothing, for
     * ever, with no error anywhere.
     *
     * `setTimeout(…, 0)` queues after every mount effect in the tree, so the
     * seed is applied to the hydrated store rather than under it.
     */
    const id = setTimeout(() => {
      dispatch({ type: 'hydrateRemote', snapshot: SNAPSHOT })
      dispatch({ type: 'signIn', user: as === 'owner' ? OWNER : ADMIN })
    }, 0)
    return () => clearTimeout(id)
  }, [as, dispatch])

  if (!remoteReady || !user) return null
  return <>{children}</>
}

/**
 * A labelled band, so a proof sheet says what it is showing.
 *
 * `heading` marks the frames where this band genuinely *is* the page title —
 * the administration tabs and the bare campaign form, neither of which the
 * harness mounts a shell around. Those pages otherwise have no `h1` at all,
 * and an accessibility sweep then reports the harness rather than the product.
 * The owner frames do not set it: `OwnerDashboardPage` draws its own `h1` (the
 * company name), and two of them is its own defect.
 */
function Band({ title, note, heading }: { title: string; note?: string; heading?: boolean }) {
  const Title = heading ? 'h1' : 'p'
  return (
    <div className="border-b border-gold-300/60 bg-nasek-900 px-4 py-2.5 text-ivory-50 sm:px-6">
      <Title className="text-sm font-bold tracking-wide">{title}</Title>
      {note && <p className="mt-0.5 text-2xs text-gold-200">{note}</p>}
    </div>
  )
}

const isSuspended = (id: string) => CAMPAIGNS.find((c) => c.id === id)?.suspended ?? false

function AdminFrame({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-ivory-100">
      <Band title={title} note={note} heading />
      <div className="mx-auto max-w-7xl p-4 sm:p-6">{children}</div>
      <ToastHost />
    </div>
  )
}

/** The one screen this harness draws, chosen by `?screen=`. */
function Screen({ name }: { name: string }) {
  const { t } = useI18n()

  switch (name) {
    case 'owner-form':
      return (
        <div className="min-h-dvh bg-ivory-100">
          <Band title="OWNER · Add Trip" note="CampaignForm — publish / cancel / discard" heading />
          <CampaignForm
            campaign={null}
            providerId="p1"
            onClose={() => {}}
            onSave={() => {}}
          />
        </div>
      )

    case 'admin-campaigns':
      return (
        <AdminFrame
          title="ADMIN · Campaign approval"
          note="approve · refuse · suspend / restore · delete · compact row actions"
        >
          <CampaignsTab campaigns={CAMPAIGNS} providers={PROVIDERS} isSuspended={isSuspended} />
        </AdminFrame>
      )

    case 'admin-owners':
      return (
        <AdminFrame
          title="ADMIN · Owner management"
          note="approve · refuse · unverify · suspend · restore"
        >
          <OwnersTab providers={PROVIDERS} />
        </AdminFrame>
      )

    case 'admin-overview':
      return (
        <AdminFrame title="ADMIN · Dashboard" note="OverviewTab — review actions">
          <OverviewTab
            campaigns={CAMPAIGNS}
            providers={PROVIDERS}
            suspendedCampaigns={1}
            suspendedUsers={0}
          />
        </AdminFrame>
      )

    case 'admin-form':
      return (
        <AdminFrame title="ADMIN · Add Trip" note="CampaignForm with the provider picker">
          <CampaignForm
            campaign={null}
            providerId=""
            providers={PROVIDERS}
            onClose={() => {}}
            onSave={() => {}}
          />
        </AdminFrame>
      )

    // The owner dashboard reads its own `?tab=` straight off the query string,
    // so every tab is reachable without the harness knowing anything about it.
    default:
      return (
        <OwnerShell>
          <Band title={`OWNER · ${t('prov.myCampaigns')}`} note="?tab= chooses the section" />
          <OwnerDashboardPage />
        </OwnerShell>
      )
  }
}

export function VisualHarness() {
  const params = new URLSearchParams(window.location.search)
  const screen = params.get('screen') ?? 'owner'
  const lang = params.get('lang') === 'en' ? 'en' : 'ar'
  const admin = screen.startsWith('admin')

  /*
   * Written before `I18nProvider` is constructed, not in an effect.
   *
   * The provider reads the language out of `localStorage` in its `useState`
   * initialiser, so an effect would be far too late — and because the key
   * survives between runs, the first proof sheet came out as English text
   * inside an RTL document: Arabic direction, Latin words, full stops on the
   * wrong side. Exactly the thing these screenshots exist to check.
   */
  try {
    window.localStorage.setItem('nasek.lang', lang)
  } catch {
    /* A harness that cannot write storage still renders; it just keeps the
       language it was given by whatever ran before it. */
  }

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  /* The administration's dictionary includes the owner's, exactly as
     `src/i18n/index.tsx` describes for the real applications. */
  const extra = admin
    ? { en: { ...ownerEn, ...adminEn }, ar: { ...ownerAr, ...adminAr } }
    : { en: ownerEn, ar: ownerAr }

  return (
    <I18nProvider extra={extra}>
      <AppStoreProvider>
        <Seed as={admin ? 'admin' : 'owner'}>
          {/*
            A router for the administration, and deliberately none for the owner
            portal.

            The dashboard mounts `HashRouter` and several of its tabs use router
            hooks, so the harness supplies a `MemoryRouter` in its place. The
            Campaign Owner Portal mounts no router at all — that is a decision,
            not an omission, so that nothing competes with Supabase for the URL
            fragment an invitation arrives in — and wrapping its screens in one
            here made the harness kinder than production.

            That is not a hypothetical. "رحلاتي" rendered a react-router `<Link>`
            for each approved trip, which throws outside a `Router`; the harness
            supplied one, drew the tab perfectly, and the first owner with an
            approved trip met an error page. A harness that lends a screen a
            context the real application withholds certifies exactly the bug it
            was built to catch.
          */}
          {admin ? (
            <MemoryRouter initialEntries={['/']}>
              <Screen name={screen} />
            </MemoryRouter>
          ) : (
            <Screen name={screen} />
          )}
        </Seed>
      </AppStoreProvider>
    </I18nProvider>
  )
}
