/* Temporary verification harness for the NASEK intelligence layer. */
import { parseNaturalQuery } from '@/services/ai/nlSearch'
import { scoreCampaigns } from '@/services/ai/smartMatch'
import { answer } from '@/services/ai/assistant'
import { CAMPAIGNS } from '@/data/campaigns'
import { applyFilters, defaultFilters } from '@/services/api/campaigns'

const CASES: [string, 'ar' | 'en'][] = [
  ['I want an Umrah trip from Muscat for 2 people under 500 OMR in December', 'en'],
  ['أبغى عمرة من مسقط لشخصين بأقل من ٥٠٠ ريال في ديسمبر', 'ar'],
  ['أرخص عمرة برية من صحار', 'ar'],
  ['حج من نزوى مع مرافقة طبية', 'ar'],
  ['Umrah in Ramadan close to the Haram', 'en'],
  ['رحلة نسائية جوية بميزانية 400 ريال', 'ar'],
  ['hello there', 'en'],
]

console.log('=========== NATURAL-LANGUAGE SEARCH ===========')
for (const [query, lang] of CASES) {
  const r = parseNaturalQuery(query, lang)
  const merged = { ...defaultFilters(), ...r.filters, query: '' }
  const hits = applyFilters(CAMPAIGNS, merged).length
  console.log(`\n"${query}"`)
  console.log(`  empty=${r.empty}  matches=${hits}`)
  for (const f of r.facets) {
    console.log(`  - ${f.field.padEnd(13)} ${f.label}   [via "${f.evidence}" @${f.confidence}]`)
  }
}

console.log('\n=========== SMART MATCH ===========')
const results = scoreCampaigns(
  {
    type: 'umrah',
    wilayahId: 'muscat',
    budget: 400,
    season: 'winter',
    travelMethod: 'air',
    services: ['hotel_madinah', 'meals'],
    travellers: 2,
  },
  'en',
  CAMPAIGNS,
)
for (const r of results) {
  console.log(`\n${r.score}%  ${r.campaign.title.en}  (${r.campaign.price} OMR)`)
  r.reasons.forEach((x) => console.log(`   + ${x}`))
  r.tradeoffs.forEach((x) => console.log(`   - ${x}`))
}

console.log('\n=========== ASSISTANT ===========')
const ASKS: [string, 'ar' | 'en'][] = [
  ['cheapest umrah from muscat', 'en'],
  ['هل يجوز أن أعتمر عن والدي المتوفى؟', 'ar'],
  ['what does a hajj package include?', 'en'],
  ['أبغى رحلة نسائية', 'ar'],
  ['how do i book?', 'en'],
]
for (const [q, lang] of ASKS) {
  const a = answer(q, lang)
  console.log(`\nQ: ${q}`)
  console.log(`A: ${a.text.split('\n')[0].slice(0, 140)}`)
  if (a.campaignIds?.length) console.log(`   -> ${a.campaignIds.join(', ')}`)
}
