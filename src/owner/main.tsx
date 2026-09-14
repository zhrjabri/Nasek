import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '@/i18n'
import { ownerEn } from '@/i18n/ownerEn'
import { ownerAr } from '@/i18n/ownerAr'
import { AppStoreProvider } from '@/store/AppStore'
import { ToastHost } from '@/components/layout/ToastHost'
import { OwnerApp } from './OwnerApp'
import '@/index.css'

/**
 * Entry point for the Campaign Owner Portal.
 *
 * The public site's entry is `src/main.tsx` and the dashboard's is
 * `src/admin/main.tsx`; neither references this file or anything below
 * `src/owner/`. Three entries, three Rollup graphs, three `dist` directories,
 * three hosts — which is what makes "a pilgrim never sees the owner portal" a
 * fact about what was shipped rather than a promise about what is rendered.
 * `npm run verify:isolation` reads the built output and checks it.
 *
 * No router, deliberately — see `OwnerApp`. The portal has one screen behind
 * its gate and four gate states, none of which is worth an address. That also
 * means no `HashRouter`, so nothing here competes with Supabase for the URL
 * fragment, which is where a password-reset link's token arrives.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* The owner strings are supplied here and only here — plus in the
        administration entry, which manages owners and needs the same words.
        They are not imported by `src/i18n/index.tsx`, so the public site's
        bundle contains none of them: no "Campaign Owner Portal", nothing that
        would tell a curious reader of that bundle this application exists. */}
    <I18nProvider extra={{ en: ownerEn, ar: ownerAr }}>
      <AppStoreProvider>
        <OwnerApp />
        {/* The dashboard confirms saves and refusals with a toast; without a
            host they are written to nothing and an owner gets no feedback at
            all on a successful publish. */}
        <ToastHost />
      </AppStoreProvider>
    </I18nProvider>
  </StrictMode>,
)
