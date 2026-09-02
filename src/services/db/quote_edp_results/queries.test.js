import {
  dbSaveEdpResults,
  dbGetEdpResults,
  dbUpdateEdpResult
} from './queries.js'

describe('dbSaveEdpResults', () => {
  const edps = [
    {
      edpId: 123,
      edpName: 'Norfolk Fens east',
      edpType: 'NUTRIENT',
      impact: {
        nitrogenTotal: {
          amount: 80,
          unit: 'mg/I TP',
          band: { min: 1, max: 3 }
        },
        phosphorusTotal: {
          amount: 60,
          unit: 'mg/I TP',
          band: { min: 1, max: 4 }
        }
      },
      levyGbp: {
        amountExcludingVat: 1100,
        amountInflationAdjusted: 1122,
        baseAmount: 1000,
        modelVersion: 1
      }
    }
  ]

  const broadsWestEdp = {
    edpId: 456,
    edpName: 'Broads west',
    edpType: 'BIODIVERSITY',
    impact: {
      nitrogenTotal: { amount: 10, unit: 'mg/I TP', band: { min: 1, max: 1 } },
      phosphorusTotal: { amount: 5, unit: 'mg/I TP', band: { min: 1, max: 1 } }
    },
    levyGbp: {
      amountExcludingVat: 2100,
      amountInflationAdjusted: 2122,
      baseAmount: 2000,
      modelVersion: 1
    }
  }

  it('should insert all EDPs in a single conflict-guarded statement', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) }

    await dbSaveEdpResults({ db, quoteId: 1, edps })

    expect(db.query).toHaveBeenCalledTimes(1)
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('INSERT INTO quote_edp_results')
    expect(sql).toContain('ON CONFLICT (quote_id, edp_id) DO NOTHING')
    expect(params).toEqual([
      1,
      123,
      'Norfolk Fens east',
      'NUTRIENT',
      JSON.stringify(edps[0].impact),
      1100,
      1000,
      1122,
      1
    ])
  })

  it('should parameterise every EDP when multiple are provided', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rowCount: 2 }) }
    const multipleEdps = [...edps, broadsWestEdp]

    await dbSaveEdpResults({ db, quoteId: 2, edps: multipleEdps })

    expect(db.query).toHaveBeenCalledTimes(1)
    const [, params] = db.query.mock.calls[0]
    expect(params).toEqual([
      2,
      123,
      'Norfolk Fens east',
      'NUTRIENT',
      JSON.stringify(edps[0].impact),
      1100,
      1000,
      1122,
      1,
      2,
      456,
      'Broads west',
      'BIODIVERSITY',
      JSON.stringify(broadsWestEdp.impact),
      2100,
      2000,
      2122,
      1
    ])
  })

  it('should return the number of rows inserted', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) }

    const inserted = await dbSaveEdpResults({ db, quoteId: 1, edps })

    expect(inserted).toBe(1)
  })

  it('should return zero without querying when there are no EDPs', async () => {
    const db = { query: vi.fn() }

    const inserted = await dbSaveEdpResults({ db, quoteId: 1, edps: [] })

    expect(inserted).toBe(0)
    expect(db.query).not.toHaveBeenCalled()
  })
})

describe('dbGetEdpResults', () => {
  it('should query quote_edp_results by quoteId and return rows', async () => {
    const mockRows = [{ edp_id: 123, edp_name: 'Norfolk Fens east' }]
    const db = { query: vi.fn().mockResolvedValue({ rows: mockRows }) }

    const result = await dbGetEdpResults({ db, quoteId: 1 })

    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM quote_edp_results WHERE quote_id = $1',
      [1]
    )
    expect(result).toEqual(mockRows)
  })
})

describe('dbUpdateEdpResult', () => {
  it('should update the matching record by quoteId and edpId', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const edp = {
      edpName: 'Updated Name',
      edpType: 'NUTRIENT',
      impact: { nitrogenTotal: { amount: 90 } },
      levyGbp: {
        amountExcludingVat: 1200,
        amountInflationAdjusted: 1222,
        baseAmount: 1100,
        modelVersion: 2
      }
    }

    await dbUpdateEdpResult({ db, quoteId: 1, edpId: 123, edp })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE quote_edp_results'),
      [
        'Updated Name',
        'NUTRIENT',
        JSON.stringify({ nitrogenTotal: { amount: 90 } }),
        1200,
        1100,
        1222,
        2,
        1,
        123
      ]
    )
  })
})
