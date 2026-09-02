import { getLevyAmount } from './get-levy-amount.js'

describe('getLevyAmount', () => {
  it('sums both amounts across multiple edps', () => {
    const edps = [
      {
        levyGbp: {
          amountExcludingVat: '1100.00',
          amountInflationAdjusted: '1122.00'
        }
      },
      {
        levyGbp: {
          amountExcludingVat: '500.50',
          amountInflationAdjusted: '510.25'
        }
      }
    ]
    expect(getLevyAmount(edps)).toEqual({
      levyAmountExcludingVat: 1600.5,
      levyAmountInflationAdjusted: 1632.25
    })
  })

  it('handles a single edp', () => {
    const edps = [
      {
        levyGbp: {
          amountExcludingVat: '1100.00',
          amountInflationAdjusted: '1122.00'
        }
      }
    ]
    expect(getLevyAmount(edps)).toEqual({
      levyAmountExcludingVat: 1100,
      levyAmountInflationAdjusted: 1122
    })
  })

  it('handles decimal values', () => {
    const edps = [
      {
        levyGbp: {
          amountExcludingVat: '999.99',
          amountInflationAdjusted: '1020.49'
        }
      },
      {
        levyGbp: {
          amountExcludingVat: '500.01',
          amountInflationAdjusted: '510.51'
        }
      }
    ]
    expect(getLevyAmount(edps)).toEqual({
      levyAmountExcludingVat: 1500,
      levyAmountInflationAdjusted: 1531
    })
  })
})
