import { Page, Text, View, Image, Link, StyleSheet } from '@react-pdf/renderer'
import {
  DIRECTIONS, TAGLINE, TERMS, TERMS_INTRO, TERMS_TITLE, POLICIES,
  type Briefing, type Rich,
} from './guest-info'

/**
 * The pages attached after a confirmation: guest briefing(s) with directions,
 * then the Terms & Conditions. Same brand, footer and Helvetica-only rules as
 * lib/pdf/quotation.tsx (no emoji, no ৳, Bangla only as an image).
 */

const BRAND = '#14532d'
const MINT  = '#f3faf6'
const LINE  = '#d6ebe0'

const s = StyleSheet.create({
  page:      { paddingTop: 34, paddingBottom: 46, paddingHorizontal: 42, fontSize: 9.5, fontFamily: 'Helvetica', color: '#1f2937' },
  head:      { flexDirection: 'row', alignItems: 'center', borderBottom: `1pt solid ${BRAND}`, paddingBottom: 7, marginBottom: 14 },
  headName:  { fontSize: 12, fontWeight: 'bold', color: BRAND },
  headTag:   { fontSize: 8, color: '#6b7280', marginTop: 1, fontStyle: 'italic' },
  headRight: { marginLeft: 'auto', fontSize: 8, color: '#6b7280', textAlign: 'right' },

  kicker:    { fontSize: 7.5, letterSpacing: 1.2, textTransform: 'uppercase', color: '#6b7280' },
  title:     { fontSize: 17, fontWeight: 'bold', color: BRAND, marginTop: 2, marginBottom: 6 },
  intro:     { fontSize: 9.5, color: '#374151', lineHeight: 1.5, marginBottom: 12 },
  section:   { fontSize: 8, letterSpacing: 0.8, textTransform: 'uppercase', color: BRAND, fontWeight: 'bold', marginBottom: 5, marginTop: 4 },

  cards:     { flexDirection: 'row', marginBottom: 10 },
  card:      { flexGrow: 1, flexBasis: 0, backgroundColor: MINT, border: `0.75pt solid ${LINE}`, borderRadius: 5, paddingVertical: 8, paddingHorizontal: 9 },
  cardGap:   { marginLeft: 7 },
  cardLabel: { fontSize: 7.5, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.6 },
  cardValue: { fontSize: 11.5, fontWeight: 'bold', color: '#111827', marginTop: 3 },

  note:      { fontSize: 9.5, marginBottom: 3, lineHeight: 1.45, color: '#374151' },
  callout:   { backgroundColor: '#fff7ed', border: '0.75pt solid #fed7aa', borderRadius: 5, paddingVertical: 6, paddingHorizontal: 9, marginBottom: 10 },
  calloutTx: { fontSize: 9, color: '#9a3412', fontWeight: 'bold' },
  closing:   { marginTop: 10, fontSize: 9.5, color: '#374151', fontStyle: 'italic' },
  sign:      { fontSize: 9.5, fontWeight: 'bold', color: BRAND, marginTop: 3 },

  dirWhere:  { fontSize: 10, fontWeight: 'bold', color: '#111827' },
  dirLand:   { fontSize: 9, color: '#4b5563', marginTop: 2 },
  linkRow:   { flexDirection: 'row', marginTop: 8, marginBottom: 10 },
  linkBtn:   { backgroundColor: BRAND, color: 'white', fontSize: 9, fontWeight: 'bold', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 4, marginRight: 8, textDecoration: 'none' },
  linkUrl:   { fontSize: 7.5, color: '#6b7280', marginBottom: 8 },

  tItem:     { flexDirection: 'row', marginBottom: 4.5 },
  tNum:      { width: 16, fontSize: 8.5, color: BRAND, fontWeight: 'bold' },
  tText:     { flex: 1, fontSize: 8.5, lineHeight: 1.45, color: '#374151' },
  pol:       { marginBottom: 6, fontSize: 8.5, lineHeight: 1.45, color: '#374151' },
  accept:    { marginTop: 8, backgroundColor: MINT, border: `0.75pt solid ${LINE}`, borderRadius: 5, padding: 9 },

  footer:    { position: 'absolute', bottom: 26, left: 42, right: 42, borderTop: '0.5pt solid #e5e7eb', paddingTop: 6, fontSize: 7.5, color: '#6b7280', textAlign: 'center' },
})

interface Common {
  logo?:        Buffer | string | null
  resortName:   string
  resortPhone?: string | null
  reference?:   string
  footer:       (pageNumber: number, totalPages: number) => string
}

function Head({ logo, resortName, reference }: Common) {
  return (
    <View style={s.head} fixed>
      {logo && <Image src={logo as any} style={{ width: 30, height: 30, marginRight: 9, objectFit: 'contain' }} />}  {/* eslint-disable-line @typescript-eslint/no-explicit-any */}
      <View>
        <Text style={s.headName}>{resortName}</Text>
        <Text style={s.headTag}>{TAGLINE}</Text>
      </View>
      {reference && <Text style={s.headRight}>Booking {reference}</Text>}
    </View>
  )
}

function Footer({ footer }: Common) {
  return <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => footer(pageNumber, totalPages)} />
}

function Cards({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <View style={s.cards} wrap={false}>
      {items.map((it, i) => (
        <View key={it.label} style={i === 0 ? s.card : [s.card, s.cardGap]}>
          <Text style={s.cardLabel}>{it.label}</Text>
          <Text style={s.cardValue}>{it.value}</Text>
        </View>
      ))}
    </View>
  )
}

function Notes({ lines }: { lines: string[] }) {
  return (
    <View>
      {lines.map((l) => <Text key={l} style={s.note}>{'\u2022  '}{l}</Text>)}
    </View>
  )
}

function BriefingBlock({ b, resortName }: { b: Briefing; resortName: string }) {
  return (
    <View>
      <Text style={s.kicker}>Guest briefing</Text>
      <Text style={s.title}>{b.title}</Text>
      <Text style={s.intro}>Dear Valued Guest,{'\n'}{b.intro}</Text>

      <Text style={s.section}>{b.timesTitle}</Text>
      <Cards items={b.times} />

      <Text style={s.section}>Check-in &amp; check-out</Text>
      <Cards items={b.timing} />
      {b.timingNote && <View style={s.callout}><Text style={s.calloutTx}>{b.timingNote}</Text></View>}

      {b.extra && (
        <View wrap={false}>
          <Text style={s.section}>{b.extra.title}</Text>
          <Notes lines={b.extra.lines} />
        </View>
      )}

      <Text style={[s.section, { marginTop: 8 }]}>Please note</Text>
      <Notes lines={b.notes} />

      <Text style={s.closing}>{b.closing}</Text>
      <Text style={s.sign}>{resortName}</Text>
    </View>
  )
}

/** Briefing(s) for the booked stay, then how to get here. */
export function GuestBriefingPage(props: Common & { briefings: Briefing[]; routesImage?: Buffer | null }) {
  const { briefings, routesImage, resortName } = props
  return (
    <Page size="A4" style={s.page} wrap>
      <Head {...props} />
      {briefings.map((b, i) => (
        <View key={b.title} break={i > 0}>
          <BriefingBlock b={b} resortName={resortName} />
        </View>
      ))}

      <View wrap={false} style={{ marginTop: 18 }}>
        <Text style={s.kicker}>Getting here</Text>
        <Text style={[s.title, { fontSize: 14 }]}>How to reach {resortName}</Text>
        <Text style={s.dirWhere}>{DIRECTIONS.where}</Text>
        <Text style={s.dirLand}>{DIRECTIONS.landmark}</Text>
        <View style={s.linkRow}>
          {DIRECTIONS.links.map((l) => <Link key={l.url} src={l.url} style={s.linkBtn}>{l.label}</Link>)}
        </View>
        {DIRECTIONS.links.map((l) => (
          <Text key={l.url} style={s.linkUrl}>
            {l.label}: <Link src={l.url} style={{ color: BRAND, textDecoration: 'underline' }}>{l.url}</Link>
          </Text>
        ))}
        <Text style={[s.section, { marginTop: 4 }]}>Contact persons for directions</Text>
        <View style={s.cards}>
          {DIRECTIONS.contacts.map((c, i) => (
            <View key={c.phone} style={i === 0 ? s.card : [s.card, s.cardGap]}>
              <Text style={{ fontSize: 9.5, fontWeight: 'bold', color: '#111827' }}>{c.name}</Text>
              <Text style={{ fontSize: 7.5, color: '#4b5563', marginTop: 1 }}>{c.role || 'Garden Centre Resort'}</Text>
              <Link src={`tel:${c.phone.replace(/[^+\d]/g, '')}`} style={{ fontSize: 10, fontWeight: 'bold', color: BRAND, marginTop: 4, textDecoration: 'none' }}>{c.phone}</Link>
            </View>
          ))}
        </View>
        {routesImage && <Image src={routesImage as any} style={{ width: '100%', marginTop: 4 }} />}  {/* eslint-disable-line @typescript-eslint/no-explicit-any */}
      </View>
      <Footer {...props} />
    </Page>
  )
}

function RichText({ r }: { r: Rich }) {
  return (
    <Text style={s.tText}>
      {r.map((seg, i) => (
        <Text key={i} style={
          seg.alert ? { color: '#b91c1c', fontWeight: 'bold' }
          : seg.mark ? { color: '#1e3a8a', fontWeight: 'bold' }
          : seg.b ? { color: '#111827', fontWeight: 'bold' } : {}
        }>{seg.t}</Text>
      ))}
    </Text>
  )
}

export function TermsPage(props: Common) {
  return (
    <Page size="A4" style={s.page} wrap>
      <Head {...props} />
      <Text style={s.kicker}>Please read before your visit</Text>
      <Text style={s.title}>{TERMS_TITLE}</Text>
      <Text style={s.intro}>{TERMS_INTRO}</Text>
      {TERMS.map((r, i) => (
        <View key={i} style={s.tItem} wrap={false}>
          <Text style={s.tNum}>{i + 1}.</Text>
          <RichText r={r} />
        </View>
      ))}
      <View style={{ marginTop: 8 }}>
        {POLICIES.filter((p) => p.label !== 'Acceptance of Terms').map((p) => (
          <Text key={p.label} style={s.pol} wrap={false}>
            <Text style={{ fontWeight: 'bold', color: '#111827' }}>{p.label}: </Text>{p.text}
          </Text>
        ))}
      </View>
      {POLICIES.filter((p) => p.label === 'Acceptance of Terms').map((p) => (
        <View key={p.label} style={s.accept} wrap={false}>
          <Text style={{ fontSize: 8.5, lineHeight: 1.45, color: '#374151' }}>
            <Text style={{ fontWeight: 'bold', color: BRAND }}>{p.label}: </Text>{p.text}
          </Text>
        </View>
      ))}
      <Footer {...props} />
    </Page>
  )
}
