import {
  BadgeCheck,
  Coins,
  Compass,
  Eye,
  Flag,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  Star,
  Watch,
} from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { Badge, Card, LinkButton, SectionHeading } from '@/components/ui'
import { LogoMark } from '@/components/brand/Logo'

/** The founding team, as named in the original NASEK documents. */
const TEAM = [
  { name: 'الزهراء بنت علي الجابري', roleAr: 'الرئيس التنفيذي', roleEn: 'Chief Executive Officer' },
  { name: 'بيان بنت حسين المعمري', roleAr: 'المدير التنفيذي للعمليات', roleEn: 'Chief Operating Officer' },
  { name: 'مُنتهى بنت خالد الزدجالي', roleAr: 'المدير التنفيذي المالي', roleEn: 'Chief Financial Officer' },
  { name: 'رياء بنت حميد الهشامي', roleAr: 'مدير الموارد البشرية', roleEn: 'Head of Human Resources' },
  { name: 'الفضل بن سعيد الهنائي', roleAr: 'مدير التسويق', roleEn: 'Head of Marketing' },
  { name: 'عهد بنت سليمان التوبي', roleAr: 'نائب مدير التسويق', roleEn: 'Deputy Head of Marketing' },
  { name: 'سعيد بن حمد السعدي', roleAr: 'مدير العلاقات العامة', roleEn: 'Head of Public Relations' },
]

const TRUST: { n: 1 | 2 | 3 | 4; icon: typeof ShieldCheck }[] = [
  { n: 1, icon: BadgeCheck },
  { n: 2, icon: Coins },
  { n: 3, icon: Star },
  { n: 4, icon: Flag },
]

/** Provider plans — the revenue model, stated plainly. */
const PLANS = [
  { id: 'basic', price: 15, ar: 'أساسي', en: 'Basic' },
  { id: 'plus', price: 35, ar: 'بلَس', en: 'Plus' },
  { id: 'premium', price: 75, ar: 'مميّز', en: 'Premium' },
]

export function AboutPage() {
  const { t, lang, money, n } = useI18n()

  return (
    <main>
      {/* ------------------------------------------------------------ hero */}
      <section className="girih-gold relative overflow-hidden border-b border-gold-500/40 bg-nasek-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_0%,rgba(201,169,97,0.15),transparent)]" />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <LogoMark className="mx-auto mb-6 h-16 w-auto" tone="ivory" />
          <h1 className="display text-[34px] text-ivory-50 sm:text-[44px]">{t('about.title')}</h1>
          <div className="rule-gold mx-auto my-6 w-24" />
          <p className="text-[16px] leading-relaxed text-ivory-200/75 sm:text-[17px]">
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

        {/* ------------------------------------------------------ the team */}
        <section className="mt-16">
          <h2 className="display text-[26px] text-ink-900">{t('about.teamTitle')}</h2>
          <ul className="stagger mt-6 grid gap-3 sm:grid-cols-2">
            {TEAM.map((member) => (
              <li key={member.name} className="surface flex items-center gap-3.5 p-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[3px] bg-nasek-50 text-[15px] font-bold text-nasek-800">
                  {member.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-ink-900">{member.name}</p>
                  <p className="truncate text-[12px] text-ink-500">
                    {lang === 'ar' ? member.roleAr : member.roleEn}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

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
                  <h3 className="text-[15px] font-bold text-ink-900">
                    {t(`trust.${item.n}.title` as MessageKey)}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">
                    {t(`trust.${item.n}.body` as MessageKey)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <Card className="mt-5 flex items-start gap-3.5 border-gold-200 bg-gold-50 p-5">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-gold-700" />
            <p className="text-[13.5px] leading-relaxed text-gold-900">{t('trust.disclaimer')}</p>
          </Card>
        </section>

        {/* -------------------------------------------------- plans & fees */}
        <section id="pricing" className="mt-16">
          <SectionHeading title={t('footer.pricing')} subtitle={t('prov.planNote')} />
          <ul className="mt-7 grid gap-4 sm:grid-cols-3">
            {PLANS.map((plan, i) => (
              <li key={plan.id}>
                <Card
                  className={
                    i === 1
                      ? 'relative border-nasek-300 p-6 ring-1 ring-nasek-200'
                      : 'p-6'
                  }
                >
                  {i === 1 && (
                    <Badge tone="gold" className="absolute -top-2.5 start-6">
                      {t('sort.recommended')}
                    </Badge>
                  )}
                  <p className="text-[13px] font-bold uppercase tracking-wider text-gold-600">
                    {lang === 'ar' ? plan.ar : plan.en}
                  </p>
                  <p className="nums mt-3 text-[30px] font-bold leading-none text-ink-900">
                    {money(plan.price)}
                  </p>
                  <p className="mt-1.5 text-[12px] text-ink-400">/ {t('prov.planMonthly')}</p>
                  <p className="mt-4 border-t border-ivory-300 pt-4 text-[13px] leading-relaxed text-ink-500">
                    {t('prov.planCommission')}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <LinkButton to="/signup?role=provider" size="lg">
              {t('footer.listCampaign')}
            </LinkButton>
          </div>
        </section>

        {/* --------------------------------------------------- the roadmap */}
        <section className="mt-16">
          <SectionHeading title={t('about.futureTitle')} subtitle={t('about.futureBody')} />
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            {[
              { icon: Watch, title: t('about.watch'), body: t('about.watchBody') },
              { icon: Compass, title: t('about.bracelet'), body: t('about.braceletBody') },
            ].map((item) => (
              <Card key={item.title} className="p-6">
                <span className="flex size-11 items-center justify-center rounded-[3px] bg-nasek-50 text-nasek-700">
                  <item.icon className="size-5" strokeWidth={1.8} />
                </span>
                <h3 className="mt-4 text-[16px] font-bold text-ink-900">{item.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">{item.body}</p>
                <Badge tone="neutral" className="mt-4">
                  {t('about.conceptNote')}
                </Badge>
              </Card>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------- legal stubs */}
        <section id="privacy" className="mt-16 grid gap-4 sm:grid-cols-2">
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
              <Eye className="size-4 text-nasek-600" />
              {t('trust.privacy')}
            </h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-500">
              {lang === 'ar'
                ? 'يجمع ناسِك البيانات اللازمة لإتمام الحجز فقط: الاسم ووسيلة التواصل وبيانات المسافرين المطلوبة من الحملة. لا تُشارك هذه البيانات مع أي جهة غير الحملة التي تحجز معها. في هذا النموذج الأولي تُحفظ البيانات في متصفحك ولا تُرسل إلى أي خادم.'
                : 'NASEK collects only what a booking requires: your name, a way to reach you, and the traveller details the campaign needs. That data is not shared with anyone other than the campaign you book with. In this prototype it is stored in your browser and sent to no server at all.'}
            </p>
          </Card>
          <Card id="terms" className="p-6">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
              <ShieldCheck className="size-4 text-nasek-600" />
              {t('trust.terms')}
            </h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-500">
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
            <ContactRow icon={<Mail className="size-4" />} value="hello@nasek.om" href="mailto:hello@nasek.om" />
            <ContactRow icon={<Phone className="size-4" />} value="+968 2400 0000" href="tel:+96824000000" />
            <ContactRow icon={<MessageSquare className="size-4" />} value={t('trust.support')} href="#" />
          </ul>
          <p className="mt-6 nums text-[12px] text-ink-400">
            {t('hero.statCampaigns')}: {n(20)} · {t('common.demoData')}
          </p>
        </section>
      </div>
    </main>
  )
}

function Prose({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h2 className="display text-[24px] text-ink-900 sm:text-[28px]">{title}</h2>
      <p className="mt-3.5 text-[15.5px] leading-[1.9] text-ink-600">{body}</p>
    </section>
  )
}

function ContactRow({
  icon,
  value,
  href,
}: {
  icon: React.ReactNode
  value: string
  href: string
}) {
  return (
    <li>
      <a
        href={href}
        className="flex items-center gap-2.5 rounded-[3px] border border-ivory-300 bg-ivory-50 px-4 py-3.5 text-[13.5px] font-semibold text-ink-700 transition-colors hover:border-nasek-300 hover:text-nasek-800"
      >
        <span className="text-nasek-600">{icon}</span>
        <span className="truncate">{value}</span>
      </a>
    </li>
  )
}
