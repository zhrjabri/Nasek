import {
  BadgeCheck,
  Coins,
  Eye,
  Flag,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  Star,
} from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { useCatalogue } from '@/hooks/useCatalogue'
import { CONTACT } from '@/data/contact'
import { Card, SectionHeading } from '@/components/ui'
import { LogoMark } from '@/components/brand/Logo'


const TRUST: { n: 1 | 2 | 3 | 4; icon: typeof ShieldCheck }[] = [
  { n: 1, icon: BadgeCheck },
  { n: 2, icon: Coins },
  { n: 3, icon: Star },
  { n: 4, icon: Flag },
]

export function AboutPage() {
  const { t, lang, n } = useI18n()
  const { campaigns } = useCatalogue()

  return (
    <main>
      {/* ------------------------------------------------------------ hero */}
      <section className="girih-gold relative overflow-hidden border-b border-gold-500/40 bg-nasek-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_0%,rgba(201,169,97,0.15),transparent)]" />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <LogoMark className="mx-auto mb-6 h-16 w-auto" tone="ivory" />
          <h1 className="display text-5xl text-ivory-50 sm:text-6xl">{t('about.title')}</h1>
          <div className="rule-gold mx-auto my-6 w-24" />
          <p className="text-lg leading-relaxed text-ivory-200/75 sm:text-lg">
            {t('about.lead')}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        {/* ---------------------------------------------------- the story */}
        <article className="space-y-10">
          <Prose title={t('about.storyTitle')} body={t('about.story')} />
          <Prose title={t('about.problemTitle')} body={t('about.problemBody')} />
          <Prose title={t('about.missionTitle')} body={t('about.missionBody')} />
        </article>

        {/* ------------------------------------------------- trust & safety */}
        <section id="trust" className="mt-16">
          <SectionHeading title={t('trust.title')} subtitle={t('trust.subtitle')} />
          <ul className="mt-7 grid gap-4 sm:grid-cols-2">
            {TRUST.map((item) => (
              <li key={item.n} className="surface flex gap-3.5 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
                  <item.icon className="size-[18px]" strokeWidth={2} />
                </span>
                <div>
                  <h3 className="text-md font-bold text-ink-900">
                    {t(`trust.${item.n}.title` as MessageKey)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                    {t(`trust.${item.n}.body` as MessageKey)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <Card className="mt-5 flex items-start gap-3.5 border-gold-200 bg-gold-50 p-5">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-gold-700" />
            <p className="text-sm leading-relaxed text-gold-900">{t('trust.disclaimer')}</p>
          </Card>
        </section>

        {/*
          The campaign-owner plans and fees table used to sit here, under
          `#pricing`.

          It was owner-facing pricing on a customer page — three
          subscription tiers, a mediation fee and a "list your campaign"
          button — and its only call to action was into a portal this site
          no longer links to or knows the address of. What a pilgrim pays
          is the campaign price, which is on every card; what a company
          pays NASEK is a conversation with the NASEK team.

          The `#pricing` anchor goes with it. Nothing in this bundle points
          at it any more — the footer column that did was removed at the
          same time.
        */}

        {/*
          The "on the roadmap" section is gone, and with it the smart watch and
          the bracelet.

          Two concept products with a "future idea" badge, on the page whose
          whole subject is what NASEK is honest about. They described hardware
          nobody is building, and the page reads better without a section whose
          own label admitted it was not real.

          Removed rather than hidden: the markup, the two icons, and all seven
          `about.*` strings behind it are deleted in both dictionaries, so
          nothing ships them. The spacing is unaffected — every section here
          carries its own `mt-16`, so the one below simply follows the one
          above.
        */}

        {/* --------------------------------------------------- legal stubs */}
        <section id="privacy" className="mt-16 grid gap-4 sm:grid-cols-2">
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-md font-bold text-ink-900">
              <Eye className="size-4 text-nasek-600" />
              {t('trust.privacy')}
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-500">
              {lang === 'ar'
                ? 'يجمع ناسِك البيانات اللازمة لإتمام الحجز فقط: الاسم ووسيلة التواصل وبيانات المسافرين المطلوبة من الحملة. لا تُشارك هذه البيانات مع أي جهة غير الحملة التي تحجز معها. في هذا النموذج الأولي تُحفظ البيانات في متصفحك ولا تُرسل إلى أي خادم.'
                : 'NASEK collects only what a booking requires: your name, a way to reach you, and the traveller details the campaign needs. That data is not shared with anyone other than the campaign you book with. In this prototype it is stored in your browser and sent to no server at all.'}
            </p>
          </Card>
          <Card id="terms" className="p-6">
            <h2 className="flex items-center gap-2 text-md font-bold text-ink-900">
              <ShieldCheck className="size-4 text-nasek-600" />
              {t('trust.terms')}
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-500">
              {lang === 'ar'
                ? 'ناسِك وسيط بين الحاج أو المعتمر وبين الحملة، والعقد قائم بينك وبين الحملة. يتحمل صاحب الحملة مسؤولية تنفيذ الخدمات المعلنة، ويتحمل ناسِك مسؤولية عرضها بدقة وشفافية.'
                : 'NASEK is an intermediary between pilgrims and campaigns; the contract is between you and the campaign. The campaign owner is responsible for delivering the advertised services, and NASEK is responsible for presenting them accurately.'}
            </p>
          </Card>
        </section>

        {/* ------------------------------------------------------- contact */}
        <section id="contact" className="mt-16">
          <SectionHeading title={t('footer.contact')} />
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            <ContactRow
              icon={<Mail className="size-4" />}
              value={CONTACT.email}
              href={`mailto:${CONTACT.email}`}
            />
            <ContactRow icon={<Phone className="size-4" />} value={CONTACT.phone} href={CONTACT.tel} ltr />
            {/* `href="#"` here was worse than a dead link. Under a hash router
                it is not inert: it clears the route fragment and drops the
                visitor on the home page, so the one row labelled "contact
                support" was the one that threw away the page they were on.
                Support is the same address the refusal notice already gives
                owners. */}
            <ContactRow
              icon={<MessageSquare className="size-4" />}
              value={t('trust.support')}
              href={`mailto:${CONTACT.email}`}
            />
          </ul>
          {/* The real count, not a constant. This read "Campaigns: 20 · Demo
              data" against a live catalogue — a number left over from the
              seeded prototype, on the one page whose whole subject is what
              NASEK is honest about. */}
          <p className="mt-6 nums text-xs text-ink-400">
            {t('hero.statCampaigns')}: {n(campaigns.length)}
          </p>
        </section>
      </div>
    </main>
  )
}

function Prose({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h2 className="display text-3xl text-ink-900 sm:text-4xl">{title}</h2>
      <p className="mt-3.5 text-md leading-[1.9] text-ink-600">{body}</p>
    </section>
  )
}

function ContactRow({
  icon,
  value,
  href,
  ltr,
}: {
  icon: React.ReactNode
  value: string
  href: string
  /** A telephone number reads left to right whichever way the page does. */
  ltr?: boolean
}) {
  return (
    <li>
      <a
        href={href}
        className="flex items-center gap-2.5 rounded-[3px] border border-ivory-300 bg-ivory-50 px-4 py-3.5 text-sm font-semibold text-ink-700 transition-colors hover:border-nasek-300 hover:text-nasek-800"
      >
        <span className="text-nasek-600">{icon}</span>
        <span className="truncate" dir={ltr ? 'ltr' : undefined}>
          {value}
        </span>
      </a>
    </li>
  )
}
