import { boundaryGeojson } from './boundaryGeojson.js'

export const validQuotePayload = {
  planningType: 'full-planning-permission',
  boundaryEntryType: 'draw',
  boundaryGeojson,
  housingUnits: 10,
  email: 'developer@housebuilder.com'
}

export const validEdpsPayload = {
  edps: [
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
}
