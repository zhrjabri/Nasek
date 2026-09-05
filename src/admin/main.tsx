import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n'
import { adminEn } from '@/i18n/adminEn'
import { adminAr } from '@/i18n/adminAr'
import { ownerEn } from '@/i18n/ownerEn'
import { ownerAr } from '@/i18n/ownerAr'
import { AppStoreProvider } from '@/store/AppStore'
import { AdminApp } from './AdminApp'
import '@/index.css'

/**
 * Entry point for the administration dashboard.
 *
 * The public site's entry is `src/main.tsx` and it does not reference this file
 * or anything below `src/admin/`. Two entries, two Rollup graphs, two `dist`
 * directories, two hosts — which is what makes "a normal user never sees the
 * admin area" a fact about what was shipped rather than a promise about what is
 * rendered.
 *
 * `HashRouter`, matching the public site. It costs a `#` in the address and buys
 * deployment to any static host with no rewrite rules at all — including GitHub
 * Pages, which is where NASEK is deployed today. A host that can rewrite
 * everything to `index.html` can switch both apps to `BrowserRouter` by
 * changing this line and its twin.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      {/*
        Two dictionaries beyond the public one, and both are supplied here
        rather than imported by `src/i18n/index.tsx` — which is what keeps them
        out of the customer bundle. A pilgrim's browser downloads no "NASEK
        administration", no "Suspend account" and no "Campaign Owner Portal".

        The owner strings are here because an administrator manages campaign
        owners and their campaigns and needs the same words for them. Copying
        those into a third file so two screens could drift apart about what
        "Under review" is called would be the wrong kind of separation: the
        point is that a *pilgrim* never receives them, not that an administrator
        must phrase things differently from an owner.
      */}
      <I18nProvider
        extra={{ en: { ...ownerEn, ...adminEn }, ar: { ...ownerAr, ...adminAr } }}
      >
        <AppStoreProvider>
          <AdminApp />
        </AppStoreProvider>
      </I18nProvider>
    </HashRouter>
  </StrictMode>,
)
