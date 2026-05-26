import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

export interface AssetLabelInput {
  asset_tag:        string
  name:             string
  category:         string
  acquisition_date: string
}

// ~5cm × 3cm sticker (points: 1cm ≈ 28.35pt)
const styles = StyleSheet.create({
  page:     { padding: 8 },
  box:      { border: '1pt solid #333', borderRadius: 4, padding: 8, height: '100%', justifyContent: 'space-between' },
  org:      { fontSize: 7, color: '#666', letterSpacing: 1 },
  tag:      { fontSize: 16, fontWeight: 'bold', marginTop: 2 },
  name:     { fontSize: 9, marginTop: 4 },
  meta:     { fontSize: 7, color: '#666', marginTop: 2 },
})

export function AssetLabelDocument(input: AssetLabelInput) {
  return (
    <Document>
      <Page size={[142, 85]} style={styles.page}>
        <View style={styles.box}>
          <View>
            <Text style={styles.org}>GARDEN CENTRE RESORT</Text>
            <Text style={styles.tag}>{input.asset_tag}</Text>
          </View>
          <View>
            <Text style={styles.name}>{input.name}</Text>
            <Text style={styles.meta}>{input.category} · acquired {input.acquisition_date}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
