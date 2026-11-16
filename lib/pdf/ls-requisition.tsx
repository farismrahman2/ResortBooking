import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

/**
 * The landscaping requisition slip — same layout as the paper "ASU
 * Requisition Slip": header block, area line, items table, remarks, and the
 * Prepared / Checked / Approved row (names and dates from the system instead
 * of pen signatures). Helvetica only: amounts as "TK".
 */
const GREEN = '#1f7a3a'
const PALE  = '#e9f7ee'
const s = StyleSheet.create({
  page:   { padding: 30, fontSize: 10, fontFamily: 'Helvetica', color: '#111827' },
  rule:   { borderTop: `2pt solid ${GREEN}` },
  head:   { flexDirection: 'row', marginTop: 8 },
  brand:  { width: 170 },
  brandName: { fontSize: 15, fontWeight: 'bold', color: GREEN },
  brandTag:  { fontSize: 8, color: GREEN, fontStyle: 'italic', marginTop: 1 },
  title:  { fontSize: 20, fontWeight: 'bold', color: GREEN, textAlign: 'right' },
  meta:   { flexDirection: 'row', marginTop: 3 },
  metaL:  { width: 110, fontSize: 10, color: '#374151' },
  metaV:  { flexGrow: 1, fontSize: 11, fontWeight: 'bold', borderBottom: `0.75pt solid ${GREEN}`, textAlign: 'center', paddingBottom: 1 },
  area:   { marginTop: 10, backgroundColor: PALE, border: `0.75pt solid ${GREEN}`, borderRadius: 4, padding: 6, fontSize: 10, fontWeight: 'bold' },
  table:  { marginTop: 10, border: `0.75pt solid ${GREEN}` },
  th:     { flexDirection: 'row', backgroundColor: GREEN, color: 'white', fontWeight: 'bold', fontSize: 10 },
  tr:     { flexDirection: 'row', borderTop: `0.5pt solid ${GREEN}` },
  c1:     { width: '46%', padding: 5 },
  c2:     { width: '18%', padding: 5, textAlign: 'center' },
  c3:     { width: '16%', padding: 5, textAlign: 'center' },
  c4:     { width: '20%', padding: 5, textAlign: 'right' },
  total:  { flexDirection: 'row', borderTop: `0.75pt solid ${GREEN}`, backgroundColor: PALE },
  remarks:{ marginTop: 8, flexDirection: 'row', fontSize: 10 },
  signs:  { marginTop: 22, flexDirection: 'row', justifyContent: 'space-between' },
  sign:   { width: '30%', alignItems: 'center' },
  signL:  { fontSize: 10, fontWeight: 'bold', color: GREEN },
  signN:  { fontSize: 13, fontWeight: 'bold', marginTop: 4, borderBottom: `0.75pt solid #111827`, width: '100%', textAlign: 'center', paddingBottom: 2 },
  signD:  { fontSize: 8, color: '#6b7280', marginTop: 2 },
  stamp:  { marginTop: 10, fontSize: 9, color: '#b91c1c', fontWeight: 'bold', textAlign: 'center' },
  foot:   { position: 'absolute', bottom: 18, left: 30, right: 30, fontSize: 7.5, color: '#6b7280', textAlign: 'center' },
})

const tk = (n: number) => `TK ${Math.round(n * 100) / 100 === Math.round(n) ? Math.round(n).toLocaleString('en-IN') : (Math.round(n * 100) / 100).toLocaleString('en-IN')}`
const day = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
const stampDay = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric' }) : ''

export interface LsRequisitionPdfInput {
  businessName: string
  projectCode: string | null
  reqNo: string
  date: string
  department: string | null
  description: string
  requestedBy: string | null
  projectLabel: string | null
  area: string | null
  items: Array<{ description: string; qty: number; unit: string | null; unit_price: number; amount: number }>
  total: number
  remarks: string | null
  status: string
  prepared: { name: string | null; at: string | null }
  checked:  { name: string | null; at: string | null }
  approved: { name: string | null; at: string | null }
  /** Entered from a paper slip: names as signed on paper. */
  fromPaper?: boolean
}

export function LsRequisitionPdf(p: LsRequisitionPdfInput) {
  const notApproved = p.status !== 'approved'
  return (
    <Document title={`Requisition ${p.reqNo}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.rule} />
        <View style={s.head}>
          <View style={s.brand}>
            <Text style={s.brandTag}>Care with Green</Text>
            <Text style={s.brandName}>{p.businessName.toUpperCase()}</Text>
          </View>
          <View style={{ flexGrow: 1 }}>
            <Text style={s.title}>{(p.projectCode ? `${p.projectCode} ` : '') + 'REQUISITION SLIP'}</Text>
            <View style={{ marginLeft: 'auto', width: 300 }}>
              <View style={s.meta}><Text style={s.metaL}>Date:</Text><Text style={s.metaV}>{day(p.date)}</Text></View>
              <View style={s.meta}><Text style={s.metaL}>Req. No.:</Text><Text style={s.metaV}>{p.reqNo}</Text></View>
              <View style={s.meta}><Text style={s.metaL}>Requested By:</Text><Text style={s.metaV}>{p.requestedBy ?? '-'}</Text></View>
              <View style={s.meta}><Text style={s.metaL}>Project / Location:</Text><Text style={s.metaV}>{p.projectLabel ?? '-'}</Text></View>
            </View>
          </View>
        </View>
        <View style={[s.meta, { marginTop: 6 }]}><Text style={s.metaL}>Department / Section:</Text><Text style={[s.metaV, { width: 300, flexGrow: 0 }]}>{p.department ?? '-'}</Text></View>
        <View style={s.meta}><Text style={s.metaL}>Description:</Text><Text style={[s.metaV, { width: 300, flexGrow: 0 }]}>{p.description}</Text></View>
        {p.area && <Text style={s.area}>{p.area}</Text>}

        <View style={s.table}>
          <View style={s.th}><Text style={s.c1}>ITEM DESCRIPTION</Text><Text style={s.c2}>QTY</Text><Text style={s.c3}>UNIT PRICE</Text><Text style={s.c4}>TOTAL AMOUNT</Text></View>
          {p.items.map((i, k) => (
            <View key={k} style={s.tr} wrap={false}>
              <Text style={s.c1}>{k + 1}.  {i.description}</Text>
              <Text style={s.c2}>{i.qty.toLocaleString('en-IN')} {i.unit ?? ''}</Text>
              <Text style={s.c3}>{tk(i.unit_price)}</Text>
              <Text style={s.c4}>{tk(i.amount)}</Text>
            </View>
          ))}
          <View style={s.total}><Text style={[s.c1, { width: '80%', textAlign: 'right', fontWeight: 'bold', color: GREEN, fontSize: 12 }]}>Total Amount</Text><Text style={[s.c4, { fontWeight: 'bold', fontSize: 12 }]}>{tk(p.total)}</Text></View>
        </View>
        {p.remarks && <View style={s.remarks}><Text style={{ width: 95 }}>Remarks / Notes:</Text><Text style={{ flexGrow: 1, fontWeight: 'bold' }}>{p.remarks}</Text></View>}

        <View style={s.signs}>
          {([['PREPARED BY', p.prepared], ['CHECKED BY', p.checked], ['APPROVED BY', p.approved]] as const).map(([label, who]) => (
            <View key={label} style={s.sign}>
              <Text style={s.signL}>{label}</Text>
              <Text style={s.signN}>{who.name ?? ' '}</Text>
              <Text style={s.signD}>{who.at ? `In the system · ${stampDay(who.at)}` : p.fromPaper ? 'Signed on the paper slip' : 'Signature'}</Text>
            </View>
          ))}
        </View>
        {notApproved && <Text style={s.stamp}>NOT APPROVED YET — status: {p.status.toUpperCase()}. Do not order against this slip.</Text>}
        <Text style={s.foot} fixed render={({ pageNumber, totalPages }) => `${p.businessName} · Requisition ${p.reqNo} · page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  )
}
