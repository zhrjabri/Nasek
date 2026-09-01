import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n'
import { adminEn } from '@/i18n/adminEn'
import { adminAr } from '@/i18n/adminAr'
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
      {/* The administration strings are supplied here and only here. They are
          not imported by `src/i18n/index.tsx`, so the public site's bundle
          contains none of them — no "NASEK administration", no "Suspend
          account", nothing that would tell a curious reader of that bundle
          what this application is or that it exists. */}
      <I18nProvider extra={{ en: adminEn, ar: adminAr }}>
        <AppStoreProvider>
          <AdminApp />
        </AppStoreProvider>
      </I18nProvider>
    </HashRouter>
  </StrictMode>,
)
