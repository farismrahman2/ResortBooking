import { describe, it, expect } from 'vitest'
import { banglaToLatin, phoneticKey } from './bangla-translit'
import { buildSearchIndex, searchItems } from './item-search'

describe('banglaToLatin', () => {
  it('romanises the inherent vowel, and drops it at word end', () => {
    expect(banglaToLatin('তেল')).toBe('tel')      // not "telo"
    expect(banglaToLatin('রসুন')).toBe('rosun')   // not "rsun"
    expect(banglaToLatin('আলু')).toBe('alu')
    expect(banglaToLatin('চিনি')).toBe('chini')
  })

  it('handles ড় ঢ় য় stored decomposed as consonant + nukta', () => {
    // These are composition exclusions — normalisation will not precompose
    // them, and comparing by literal glyph silently fails.
    expect(banglaToLatin('মিষ্টি কুমড়া')).toBe('mishti kumora')
    expect(banglaToLatin('গুঁড়া দুধ')).toBe('gura dudh')
    expect(banglaToLatin('পেঁয়াজ')).toBe('peyaj')
  })

  it('drops chandrabindu and spells out anusvara', () => {
    expect(banglaToLatin('মাংস')).toBe('mangs')
  })
})

describe('phoneticKey', () => {
  it('collapses the spellings people actually disagree about', () => {
    expect(phoneticKey('mach')).toBe(phoneticKey('machh'))
    expect(phoneticKey('mach')).toBe(phoneticKey('maach'))
    expect(phoneticKey('mangso')).toBe(phoneticKey('mangsho'))
    expect(phoneticKey('deshi')).toBe(phoneticKey('desi'))
  })
})

describe('searchItems', () => {
  const items = [
    { id: '1', name: 'Cooking oil / তেল' },
    { id: '2', name: 'Potato / আলু' },
    { id: '3', name: 'Garlic / রসুন' },
    { id: '4', name: 'Pumpkin / মিষ্টি কুমড়া' },
    { id: '5', name: 'Beef / গরুর মাংস' },
  ]
  const index = buildSearchIndex(items)
  const find = (q: string) => searchItems(items, index, q).map((i) => i.id)

  it('finds Bangla names typed in English', () => {
    expect(find('tel')).toContain('1')
    expect(find('alu')).toContain('2')
    expect(find('rosun')).toContain('3')
    expect(find('kumra')).toContain('4')
    expect(find('mangso')).toContain('5')
  })

  it('still finds English names', () => {
    expect(find('pump')).toContain('4')
    expect(find('beef')).toContain('5')
  })

  it('ranks the exact English match above a fuzzy one', () => {
    expect(find('potato')[0]).toBe('2')
  })

  it('excludes items already on the sheet', () => {
    expect(searchItems(items, index, 'tel', { exclude: new Set(['1']) })).toHaveLength(0)
  })
})
