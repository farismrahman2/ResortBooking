import { describe, it, expect } from 'vitest'
import { transliterateBanglaToLatin, dishSearchMatches } from './transliterate'

describe('transliterateBanglaToLatin', () => {
  it('native words romanize with inherent vowel', () => {
    expect(transliterateBanglaToLatin('কলা')).toBe('kola')
    expect(transliterateBanglaToLatin('আলু')).toBe('alu')
    expect(transliterateBanglaToLatin('ডিম')).toBe('dim')
    expect(transliterateBanglaToLatin('ভাত')).toBe('bhat')
  })
  it('drops the inherent vowel at word end but keeps it mid-word', () => {
    expect(transliterateBanglaToLatin('পরোটা')).toBe('porota')
    expect(transliterateBanglaToLatin('খিচুড়ি')).toBe('khichuri')
  })
  it('handles conjuncts (hasant) without an inherent vowel', () => {
    // স্যান্ডউইচ etc. — just assert the conjunct join has no stray vowel
    expect(transliterateBanglaToLatin('স্ট')).toBe('st')
  })
  it('passes Latin, digits, and punctuation through', () => {
    expect(transliterateBanglaToLatin('পরোটা (2pcs)')).toBe('porota (2pcs)')
  })
})

describe('dishSearchMatches', () => {
  it('matches a Bangla name by its English transliteration', () => {
    expect(dishSearchMatches('কলা', 'kola')).toBe(true)
    expect(dishSearchMatches('কলা', 'kol')).toBe(true)
    expect(dishSearchMatches('আলু ভর্তা', 'alu')).toBe(true)
    expect(dishSearchMatches('মাছ ভাজি', 'mach')).toBe(true)
  })
  it('still matches direct Bangla substrings', () => {
    expect(dishSearchMatches('আলু ভর্তা', 'ভর্তা')).toBe(true)
  })
  it('is case-insensitive and empty matches everything', () => {
    expect(dishSearchMatches('কলা', 'KOLA')).toBe(true)
    expect(dishSearchMatches('কলা', '')).toBe(true)
  })
  it('rejects a non-match', () => {
    expect(dishSearchMatches('কলা', 'chicken')).toBe(false)
  })
})
