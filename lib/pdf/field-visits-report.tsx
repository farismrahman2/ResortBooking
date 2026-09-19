import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { formatDate } from '@/lib/formatters/dates'
import type { FieldVisitsReport, FieldVisitReportRow, CountRow } from '@/lib/queries/reports/field-visits'

/**
 * The field-visit report PDF: a summary page, then one card per visit
 * showing only the fields that were actually filled in.
 *
 * Same constraints as the quotation PDF: built-in Helvetica only, so no
 * taka sign, emoji or arrows (they print as the wrong glyph), and no
 * lineHeight on the Page style or the page-number footer disappears.
 */

const BRAND = '#14532d'

const styles = StyleSheet.create({
  page: {
    paddingTop: 34, paddingBottom: 40, paddingHorizontal: 38,
    fontSize: 9, fontFamily: 'Helvetica', color: '#111827',
  },
  header:     { borderBottom: `1pt solid ${BRAND}`, paddingBottom: 8, marginBottom: 10 },
  headerRow:  { flexDirection: 'row', alignItems: 'center' },
  brand:      { fontSize: 15, fontWeight: 'bold', color: BRAND },
  brandSub:   { fontSize: 8, color: '#6b7280', marginTop: 2 },
  titleBar:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  title:      { fontSize: 17, fontWeight: 'bold', letterSpacing: 1 },
  titleSub:   { fontSize: 9, color: '#374151', marginTop: 2 },
  titleMeta:  { fontSize: 8, textAlign: 'right', color: '#6b7280', lineHeight: 1.4 },

  // Summary page
  kpis:       { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  kpi: {
    width: '25%', paddingRight: 6, marginBottom: 6,
  },
  kpiBox:     { border: '0.5pt solid #d1d5db', borderRadius: 3, padding: 6 },
  kpiLabel:   { fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280' },
  kpiValue:   { fontSize: 14, fontWeight: 'bold', marginTop: 2 },
  kpiNote:    { fontSize: 7, color: '#6b7280', marginTop: 1 },
  twoCol:     { flexDirection: 'row', marginTop: 6 },
  col:        { width: '50%', paddingRight: 10 },
  sectionLabel: {
    fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5,
    color: BRAND, fontWeight: 'bold', marginTop: 8, marginBottom: 3,
  },
  miniRow:    { flexDirection: 'row', justifyContent: 'space-between', borderTop: '0.5pt solid #e5e7eb', paddingVertical: 2.5 },
  miniKey:    { flexGrow: 1, flexShrink: 1, paddingRight: 6 },
  miniCount:  { width: 30, textAlign: 'right', fontWeight: 'bold' },

  // Visit cards
  card:       { marginTop: 10, border: '0.5pt solid #d1d5db', borderRadius: 4 },
  cardHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    backgroundColor: '#f0f7f2', borderBottom: `0.5pt solid #cfe3d6`, padding: 7, borderTopLeftRadius: 4, borderTopRightRadius: 4,
  },
  org:        { fontSize: 11, fontWeight: 'bold', color: BRAND },
  orgSub:     { fontSize: 8, color: '#374151', marginTop: 2 },
  headRight:  { alignItems: 'flex-end' },
  headDate:   { fontSize: 9, fontWeight: 'bold' },
  chips:      { flexDirection: 'row', marginTop: 3 },
  chip:       { fontSize: 7, fontWeight: 'bold', letterSpacing: 0.4, paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3, marginLeft: 4 },
  cardBody:   { padding: 7, paddingTop: 2 },
  group:      { marginTop: 5 },
  groupLabel: { fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280', marginBottom: 2 },
  grid:       { flexDirection: 'row', flexWrap: 'wrap' },
  cell:       { width: '50%', flexDirection: 'row', paddingVertical: 1.5, paddingRight: 8 },
  cellWide:   { width: '100%', flexDirection: 'row', paddingVertical: 1.5 },
  key:        { width: 78, color: '#6b7280', flexShrink: 0 },
  val:        { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  table:      { borderTop: '0.5pt solid #d1d5db', marginTop: 2 },
  tr:         { flexDirection: 'row', borderBottom: '0.5pt solid #e5e7eb', paddingVertical: 3 },
  th:         { fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280', paddingVertical: 2 },
  cardFoot:   { fontSize: 7, color: '#9ca3af', paddingHorizontal: 7, paddingBottom: 6, marginTop: 4 },

  footer: {
    position: 'absolute', bottom: 24, left: 38, right: 38,
    borderTop: '0.5pt solid #e5e7eb', paddingTop: 5,
    fontSize: 7.5, color: '#6b7280', textAlign: 'center',
  },
})

const INTEREST_CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  hot:  { bg: '#fee2e2', fg: '#991b1b', label: 'HOT' },
  warm: { bg: '#fef3c7', fg: '#92400e', label: 'WARM' },
  cold: { bg: '#e0f2fe', fg: '#075985', label: 'COLD' },
}
const STATUS_CHIP: Record<string, { bg: string; fg: string }> = {
  draft:     { bg: '#f3f4f6', fg: '#374151' },
  submitted: { bg: '#fef3c7', fg: '#92400e' },
  processed: { bg: '#dcfce7', fg: '#166534' },
  void:      { bg: '#fee2e2', fg: '#991b1b' },
}

export interface FieldVisitsPdfInput {
  report:        FieldVisitsReport
  executiveName?: string | null
  resortName:    string
  resortAddress: string
  resortPhone:   string
  logo?:         Buffer | null
  generatedAt:   Date
}

const money = (n: number) => `BDT ${Math.round(n).toLocaleString('en-IN')}`
const has   = (v: unknown) =>
  !(v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0))
const list  = (v: string[] | null | undefined) => (v && v.length ? v.join(', ') : null)
const dash  = '-'

/** A label/value pair — rendered only when there is a value. */
function Field({ label, value, wide }: { label: string; value: unknown; wide?: boolean }) {
  if (!has(value)) return null
  return (
    <View style={wide ? styles.cellWide : styles.cell}>
      <Text style={styles.key}>{label}</Text>
      <Text style={styles.val}>{String(value)}</Text>
    </View>
  )
}

/** A group of fields; drops itself when every field is empty. */
function Group({ label, fields }: { label: string; fields: Array<{ label: string; value: unknown; wide?: boolean }> }) {
  const live = fields.filter((f) => has(f.value))
  if (live.length === 0) return null
  return (
    <View style={styles.group} wrap={false}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.grid}>
        {live.map((f) => <Field key={f.label} {...f} />)}
      </View>
    </View>
  )
}

function MiniTable({ label, rows, max = 8 }: { label: string; rows: CountRow[]; max?: number }) {
  if (rows.length === 0) return null
  return (
    <View wrap={false}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {rows.slice(0, max).map((r) => (
        <View key={r.key} style={styles.miniRow}>
          <Text style={styles.miniKey}>{r.key}</Text>
          <Text style={styles.miniCount}>{r.count}</Text>
        </View>
      ))}
    </View>
  )
}

function VisitCard({ v }: { v: FieldVisitReportRow }) {
  const interest = v.interest_level ? INTEREST_CHIP[v.interest_level] : null
  const status   = STATUS_CHIP[v.status] ?? STATUS_CHIP.draft
  const nextEvent = [
    v.next_event_month,
    v.next_event_type,
    v.next_event_pax ? `${v.next_event_pax} pax` : null,
  ].filter(Boolean).join(' / ')
  const gps = v.gps_lat && v.gps_lng ? `${Number(v.gps_lat).toFixed(5)}, ${Number(v.gps_lng).toFixed(5)}` : null
  const foot = [
    v.submitted_at ? `Submitted ${formatDate(v.submitted_at.slice(0, 10))}` : null,
    v.processed_at ? `Processed ${formatDate(v.processed_at.slice(0, 10))}` : null,
    gps ? `GPS ${gps}` : null,
    v.void_reason ? `Void: ${v.void_reason}` : null,
  ].filter(Boolean).join('  ·  ')

  return (
    <View style={styles.card}>
      <View style={styles.cardHead} minPresenceAhead={90}>
        <View style={{ flexGrow: 1, flexShrink: 1 }}>
          <Text style={styles.org}>{v.organisation_name?.trim() || '(organisation not recorded)'}</Text>
          <Text style={styles.orgSub}>
            {[v.visit_ref, v.sector_name, v.territory_zone?.trim()].filter(Boolean).join('  ·  ')}
          </Text>
        </View>
        <View style={styles.headRight}>
          <Text style={styles.headDate}>{v.visit_date ? formatDate(v.visit_date) : 'No date'}</Text>
          <View style={styles.chips}>
            {interest && (
              <Text style={[styles.chip, { backgroundColor: interest.bg, color: interest.fg }]}>{interest.label}</Text>
            )}
            <Text style={[styles.chip, { backgroundColor: status.bg, color: status.fg }]}>{v.status_label.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Group label="Visit" fields={[
          { label: 'Executive',   value: v.sales_executive_name },
          { label: 'Visit type',  value: v.visit_type_label },
          { label: 'Address',     value: v.office_address?.trim(), wide: true },
        ]} />

        <Group label="Organisation" fields={[
          { label: 'Employees',    value: v.employee_band_label },
          { label: 'CRM account',  value: v.account_name },
          { label: 'Sign-off by',  value: list(v.decision_signoff) },
          { label: 'Best time',    value: v.best_time_to_call },
          { label: 'Channel',      value: list(v.preferred_channel) },
          { label: 'Pipeline',     value: v.pipeline_stage },
          { label: 'Discount tier', value: v.discount_tier ? v.discount_tier.toUpperCase() : null },
        ]} />

        {v.contacts.length > 0 && (
          <View style={styles.group} wrap={false}>
            <Text style={styles.groupLabel}>Contacts</Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <Text style={[styles.th, { width: '28%' }]}>Name</Text>
                <Text style={[styles.th, { width: '28%' }]}>Designation</Text>
                <Text style={[styles.th, { width: '30%' }]}>Mobile / email</Text>
                <Text style={[styles.th, { width: '14%', textAlign: 'right' }]}>Decision maker</Text>
              </View>
              {v.contacts.map((c) => (
                <View key={c.id} style={styles.tr}>
                  <Text style={{ width: '28%', paddingRight: 4 }}>{c.name?.trim() || dash}</Text>
                  <Text style={{ width: '28%', paddingRight: 4 }}>
                    {[c.designation, c.department].filter(Boolean).join(', ') || dash}
                  </Text>
                  <Text style={{ width: '30%', paddingRight: 4 }}>
                    {[c.mobile, c.email].filter(Boolean).join('  ') || dash}
                  </Text>
                  <Text style={{ width: '14%', textAlign: 'right', fontWeight: 'bold' }}>{c.is_decision_maker ? 'Yes' : ''}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Group label="Requirements" fields={[
          { label: 'Event types',   value: list(v.event_types), wide: true },
          { label: 'Events / year', value: v.events_per_year },
          { label: 'Headcount',     value: v.typical_headcount },
          { label: 'Format',        value: list(v.event_format) },
          { label: 'Preferred day', value: list(v.preferred_day) },
          { label: 'Budget / head', value: v.budget_band_label },
          { label: 'Rooms needed',  value: v.rooms_needed },
          { label: 'Annual spend',  value: v.annual_event_spend ? money(Number(v.annual_event_spend)) : null },
          { label: 'Peak months',   value: list(v.peak_months), wide: true },
          { label: 'Transport',     value: list(v.transport) },
        ]} />

        {v.venues.length > 0 && (
          <View style={styles.group} wrap={false}>
            <Text style={styles.groupLabel}>Venues they use now</Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <Text style={[styles.th, { width: '28%' }]}>Venue</Text>
                <Text style={[styles.th, { width: '16%' }]}>When</Text>
                <Text style={[styles.th, { width: '10%', textAlign: 'right' }]}>Pax</Text>
                <Text style={[styles.th, { width: '16%', textAlign: 'right' }]}>Rate / head</Text>
                <Text style={[styles.th, { width: '30%', paddingLeft: 6 }]}>Feedback</Text>
              </View>
              {v.venues.map((x) => (
                <View key={x.id} style={styles.tr}>
                  <Text style={{ width: '28%', paddingRight: 4 }}>{x.venue_name?.trim() || dash}</Text>
                  <Text style={{ width: '16%' }}>{x.event_month_year || dash}</Text>
                  <Text style={{ width: '10%', textAlign: 'right' }}>{x.pax ?? dash}</Text>
                  <Text style={{ width: '16%', textAlign: 'right' }}>{x.rate_per_head ? money(Number(x.rate_per_head)) : dash}</Text>
                  <Text style={{ width: '30%', paddingLeft: 6 }}>{x.feedback?.trim() || dash}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Group label="Outcome" fields={[
          { label: 'Materials',  value: list(v.materials_labels) },
          { label: 'Next event', value: nextEvent || null },
          { label: 'Next step',  value: list(v.next_step), wide: true },
          { label: 'Due by',     value: v.due_by ? formatDate(v.due_by) : null },
          { label: 'Owner',      value: v.follow_up_owner_name },
        ]} />
      </View>

      {foot ? <Text style={styles.cardFoot}>{foot}</Text> : <View style={{ height: 4 }} />}
    </View>
  )
}

export function FieldVisitsReportDocument(p: FieldVisitsPdfInput) {
  const { report: r } = p
  const s = r.summary
  const rangeLabel = `${formatDate(r.from)} to ${formatDate(r.to)}`

  return (
    <Document title={`Field visit report ${r.from} to ${r.to}`} author={p.resortName}>
      <Page size="A4" style={styles.page} wrap>
        {/* Brand */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            {p.logo && (
              <Image src={p.logo as any} style={{ width: 46, height: 46, marginRight: 10, objectFit: 'contain' }} />  // eslint-disable-line @typescript-eslint/no-explicit-any
            )}
            <View style={{ flexGrow: 1 }}>
              <Text style={styles.brand}>{p.resortName}</Text>
              <Text style={styles.brandSub}>{p.resortAddress}</Text>
              {p.resortPhone ? <Text style={styles.brandSub}>{p.resortPhone}</Text> : null}
            </View>
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleBar}>
          <View>
            <Text style={styles.title}>FIELD VISIT REPORT</Text>
            <Text style={styles.titleSub}>
              {rangeLabel}{p.executiveName ? `  ·  ${p.executiveName}` : ''}
            </Text>
          </View>
          <Text style={styles.titleMeta}>
            {`Form GCR-CS-01\nGenerated ${formatDate(p.generatedAt.toISOString().slice(0, 10))}`}
          </Text>
        </View>

        {/* KPIs */}
        <View style={styles.kpis}>
          {[
            { label: 'Visits',          value: s.visits,          note: `${s.organisations} organisation${s.organisations === 1 ? '' : 's'}` },
            { label: 'Contacts met',    value: s.contacts,        note: `${s.decision_makers} decision maker${s.decision_makers === 1 ? '' : 's'}` },
            { label: 'Hot / warm / cold', value: `${s.hot} / ${s.warm} / ${s.cold}`, note: 'interest level' },
            { label: 'Follow-ups open', value: s.follow_ups_due,  note: s.overdue ? `${s.overdue} overdue` : 'none overdue' },
          ].map((k) => (
            <View key={k.label} style={styles.kpi}>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiLabel}>{k.label}</Text>
                <Text style={styles.kpiValue}>{String(k.value)}</Text>
                <Text style={styles.kpiNote}>{k.note}</Text>
              </View>
            </View>
          ))}
        </View>

        {s.visits === 0 ? (
          <Text style={{ marginTop: 12, color: '#6b7280' }}>No field visits were recorded in this period.</Text>
        ) : (
          <>
            <View style={styles.twoCol}>
              <View style={styles.col}>
                <MiniTable label="By executive"       rows={s.by_executive} />
                <MiniTable label="By territory"       rows={s.by_territory} />
                <MiniTable label="Events they hold"   rows={s.event_types} max={12} />
              </View>
              <View style={styles.col}>
                <MiniTable label="By sector"          rows={s.by_sector} />
                <MiniTable label="Visit type"         rows={s.by_visit_type} />
                <MiniTable label="Status"             rows={s.by_status} />
                <MiniTable label="Preferred day"      rows={s.preferred_days} />
                <MiniTable label="Budget per head"    rows={s.budget_bands} />
                <MiniTable label="Agreed next steps"  rows={s.next_steps} />
              </View>
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 16, fontSize: 9 }]} minPresenceAhead={140}>
              Visits ({s.visits})
            </Text>
            {r.rows.map((v) => <VisitCard key={v.id} v={v} />)}
          </>
        )}

        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) =>
          `${p.resortName} · Field visit report · ${rangeLabel} · Page ${pageNumber} of ${totalPages}`
        } />
      </Page>
    </Document>
  )
}
