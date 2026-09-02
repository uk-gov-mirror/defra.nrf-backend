import { mapQuoteRows } from './quote-row-mapper.js'
import { buildNotifyStatusUrl } from '../../../common/helpers/notify-status-url.js'

vi.mock('../../../common/helpers/notify-status-url.js', () => ({
  buildNotifyStatusUrl: vi.fn()
}))

const baseRow = {
  id: 1,
  reference: 'NRL-000001',
  user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  created_at: '2026-03-23T00:00:00.000Z',
  residential_building_count: 10,
  boundary_geodata: '{"type":"Polygon"}',
  boundary_entry_type: 'upload',
  boundary_filename: 'site-boundary.shp',
  email_address: 'developer@housebuilder.com'
}

describe('mapQuoteRows', () => {
  it('returns mapped quote with EDPs when given populated rows', () => {
    const rows = [
      {
        ...baseRow,
        edp_id: 'EDP-001',
        edp_name: 'Test EDP',
        edp_type: 'flood',
        impact: { score: 1 },
        levy_excluding_vat: '1100.00',
        levy_base_amount: '1000.00',
        levy_inflation_adjusted: '1122.00',
        levy_model_version: 1
      }
    ]

    const result = mapQuoteRows(rows)

    expect(result).toEqual({
      id: 1,
      reference: 'NRL-000001',
      userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      createdAt: '2026-03-23T00:00:00.000Z',
      planningType: undefined,
      housingUnits: 10,
      boundary: {
        geoJsonWgs84: '{"type":"Polygon"}',
        userInputType: 'upload',
        filename: 'site-boundary.shp'
      },
      email: {
        address: 'developer@housebuilder.com',
        sendRequestAt: null,
        status: null,
        notifyStatusUrl: null
      },
      disableAnalyticsAudit: false,
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
  })

  it('maps the latest email notification status and builds a Notify status URL', () => {
    vi.mocked(buildNotifyStatusUrl).mockReturnValue('https://status/abc')
    const notificationId = '47cbb989-9546-418c-8828-232c3dc57537'
    const requestedAt = '2026-08-01T09:00:00.000Z'
    const rows = [
      {
        ...baseRow,
        email_status: 'delivered',
        email_notification_id: notificationId,
        email_requested_at: requestedAt,
        edp_id: null,
        edp_name: null,
        edp_type: null,
        impact: null,
        levy_excluding_vat: null,
        levy_base_amount: null,
        levy_inflation_adjusted: null,
        levy_model_version: null
      }
    ]

    const result = mapQuoteRows(rows)

    expect(buildNotifyStatusUrl).toHaveBeenCalledWith(notificationId)
    expect(result.email).toEqual({
      address: 'developer@housebuilder.com',
      sendRequestAt: requestedAt,
      status: 'delivered',
      notifyStatusUrl: 'https://status/abc'
    })
  })

  it('returns mapped quote with empty edps when edp_id is null', () => {
    const rows = [
      {
        ...baseRow,
        edp_id: null,
        edp_name: null,
        edp_type: null,
        impact: null,
        levy_excluding_vat: null,
        levy_base_amount: null,
        levy_inflation_adjusted: null,
        levy_model_version: null
      }
    ]

    const result = mapQuoteRows(rows)

    expect(result.edps).toEqual([])
    expect(result.levyGbp).toBeNull()
  })

  it('returns null when rows array is empty', () => {
    expect(mapQuoteRows([])).toBeNull()
  })

  it('maps multiple EDP rows for the same quote correctly', () => {
    const rows = [
      {
        ...baseRow,
        edp_id: 'EDP-001',
        edp_name: 'First EDP',
        edp_type: 'flood',
        impact: { nitrogenBand: 'low' },
        levy_excluding_vat: '1100.00',
        levy_base_amount: '1000.00',
        levy_inflation_adjusted: '1122.00',
        levy_model_version: 1
      },
      {
        ...baseRow,
        edp_id: 'EDP-002',
        edp_name: 'Second EDP',
        edp_type: 'phosphorus',
        impact: { phosphorusBand: 'high' },
        levy_excluding_vat: '2100.00',
        levy_base_amount: '2000.00',
        levy_inflation_adjusted: '2122.00',
        levy_model_version: 1
      }
    ]

    const result = mapQuoteRows(rows)

    expect(result.edps).toHaveLength(2)
    expect(result.edps[0]).toMatchObject({
      edpId: 'EDP-001',
      edpName: 'First EDP'
    })
    expect(result.edps[1]).toMatchObject({
      edpId: 'EDP-002',
      edpName: 'Second EDP'
    })
  })
})
