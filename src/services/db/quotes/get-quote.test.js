import { dbGetQuote } from './get-quote.js'

describe('dbGetQuote', () => {
  it('should return the mapped quote with edps when found', async () => {
    const mockRow = {
      id: 1,
      reference: 'NRL-000001',
      user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      created_at: '2026-03-23T00:00:00.000Z',
      residential_building_count: 10,
      boundary_geodata: '{"type":"Polygon"}',
      boundary_entry_type: 'upload',
      boundary_filename: 'site-boundary.shp',
      email_address: 'developer@housebuilder.com',
      email_status: 'delivered',
      email_notification_id: '47cbb989-9546-418c-8828-232c3dc57537',
      edp_id: 'EDP-001',
      edp_name: 'Test EDP',
      edp_type: 'flood',
      impact: { score: 1 },
      levy_excluding_vat: '1100.00',
      levy_base_amount: '1000.00',
      levy_inflation_adjusted: '1122.00',
      levy_model_version: 1
    }
    const db = { query: vi.fn().mockResolvedValue({ rows: [mockRow] }) }

    const result = await dbGetQuote({ db, reference: 'NRL-000001' })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN quote_edp_results'),
      ['NRL-000001']
    )
    expect(result).toMatchObject({
      id: 1,
      reference: 'NRL-000001',
      userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      createdAt: '2026-03-23T00:00:00.000Z',
      housingUnits: 10,
      boundary: {
        geoJsonWgs84: '{"type":"Polygon"}',
        userInputType: 'upload',
        filename: 'site-boundary.shp'
      },
      email: {
        address: 'developer@housebuilder.com',
        sendRequestAt: null
      },
      edps: [
        {
          edpId: 'EDP-001',
          edpName: 'Test EDP',
          edpType: 'flood',
          impact: { score: 1 },
          levyGbp: {
            amountExcludingVat: '1100.00',
            amountInflationAdjusted: '1122.00',
            baseAmount: '1000.00',
            modelVersion: 1
          }
        }
      ],
      levyGbp: {
        levyAmountExcludingVat: 1100,
        levyAmountInflationAdjusted: 1122
      }
    })
    expect(result.email.status).toBe('delivered')
  })

  it('should return the quote with empty edps when no edp results exist', async () => {
    const mockRow = {
      id: 1,
      reference: 'NRL-000001',
      user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      created_at: '2026-03-23T00:00:00.000Z',
      residential_building_count: null,
      boundary_geodata: '{"type":"Polygon"}',
      boundary_entry_type: 'draw',
      email_address: 'developer@housebuilder.com',
      edp_id: null,
      edp_name: null,
      edp_type: null,
      impact: null,
      levy_excluding_vat: null,
      levy_base_amount: null,
      levy_inflation_adjusted: null,
      levy_model_version: null
    }
    const db = { query: vi.fn().mockResolvedValue({ rows: [mockRow] }) }

    const result = await dbGetQuote({ db, reference: 'NRL-000001' })

    expect(result.edps).toEqual([])
  })

  it('should return null when the quote is not found', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    const result = await dbGetQuote({ db, reference: 'NRL-000001' })

    expect(result).toBeNull()
  })
})
