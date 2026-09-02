import { formatCurrency } from './format-currency.js'

describe('formatCurrency', () => {
  it.each([
    [1100, '£1,100.00'],
    [1600.5, '£1,600.50'],
    [0, '£0.00'],
    [1234567.89, '£1,234,567.89']
  ])('formats %p as %p', (value, expected) => {
    expect(formatCurrency(value)).toBe(expected)
  })

  it('supports a custom locale and currency', () => {
    expect(formatCurrency(1100, 'en-US', 'USD')).toBe('$1,100.00')
  })
})
