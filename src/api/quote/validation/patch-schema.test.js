import { patchSchema } from './patch-schema.js'

const validImpactMeasurement = {
  amount: 1.5,
  unit: 'mg/I TP',
  band: { min: 1, max: 2 }
}

const validEdp = {
  edpId: 1,
  edpName: 'Norfolk Fens east',
  edpType: 'NUTRIENT',
  impact: {
    nitrogenTotal: validImpactMeasurement,
    phosphorusTotal: validImpactMeasurement
  },
  levyGbp: {
    amountExcludingVat: 10.0,
    amountInflationAdjusted: 10.0,
    baseAmount: 10.0,
    modelVersion: 1
  }
}

const validPayload = { edps: [validEdp] }

const validate = (payload) =>
  patchSchema.validate(payload, { abortEarly: false })

describe('patchSchema', () => {
  it('accepts a valid payload', () => {
    const { error } = validate(validPayload)
    expect(error).toBeUndefined()
  })

  describe('edps', () => {
    it('is required', () => {
      const { error } = validate({})
      expect(error).toBeDefined()
    })

    it('accepts multiple EDPs', () => {
      const { error } = validate({ edps: [validEdp, validEdp] })
      expect(error).toBeUndefined()
    })
  })

  describe('edpId', () => {
    it('is required', () => {
      const { edpId: _, ...rest } = validEdp
      const { error } = validate({ edps: [rest] })
      expect(error).toBeDefined()
    })

    it('must be an integer', () => {
      const { error } = validate({ edps: [{ ...validEdp, edpId: 1.5 }] })
      expect(error).toBeDefined()
    })
  })

  describe('edpName', () => {
    it('is required', () => {
      const { edpName: _, ...rest } = validEdp
      const { error } = validate({ edps: [rest] })
      expect(error).toBeDefined()
    })
  })

  describe('edpType', () => {
    it('only accepts NUTRIENT', () => {
      const { error } = validate({
        edps: [{ ...validEdp, edpType: 'BIODIVERSITY' }]
      })
      expect(error).toBeDefined()
    })

    it('is required', () => {
      const { edpType: _, ...rest } = validEdp
      const { error } = validate({ edps: [rest] })
      expect(error).toBeDefined()
    })
  })

  describe('impact', () => {
    it('is required', () => {
      const { impact: _, ...rest } = validEdp
      const { error } = validate({ edps: [rest] })
      expect(error).toBeDefined()
    })

    it('requires nitrogenTotal', () => {
      const { error } = validate({
        edps: [
          {
            ...validEdp,
            impact: { phosphorusTotal: validImpactMeasurement }
          }
        ]
      })
      expect(error).toBeDefined()
    })

    it('requires phosphorusTotal', () => {
      const { error } = validate({
        edps: [
          {
            ...validEdp,
            impact: { nitrogenTotal: validImpactMeasurement }
          }
        ]
      })
      expect(error).toBeDefined()
    })

    describe('impact measurement', () => {
      it('requires amount', () => {
        const { amount: _, ...rest } = validImpactMeasurement
        const { error } = validate({
          edps: [
            {
              ...validEdp,
              impact: {
                nitrogenTotal: rest,
                phosphorusTotal: validImpactMeasurement
              }
            }
          ]
        })
        expect(error).toBeDefined()
      })

      it('only accepts mg/I TP as unit', () => {
        const { error } = validate({
          edps: [
            {
              ...validEdp,
              impact: {
                nitrogenTotal: { ...validImpactMeasurement, unit: 'kg/ha' },
                phosphorusTotal: validImpactMeasurement
              }
            }
          ]
        })
        expect(error).toBeDefined()
      })

      it('requires band between 1 and 4', () => {
        const { error } = validate({
          edps: [
            {
              ...validEdp,
              impact: {
                nitrogenTotal: {
                  ...validImpactMeasurement,
                  band: { min: 1, max: 5 }
                },
                phosphorusTotal: validImpactMeasurement
              }
            }
          ]
        })
        expect(error).toBeDefined()
      })

      it('rejects band of 0', () => {
        const { error } = validate({
          edps: [
            {
              ...validEdp,
              impact: {
                nitrogenTotal: {
                  ...validImpactMeasurement,
                  band: { min: 0, max: 1 }
                },
                phosphorusTotal: validImpactMeasurement
              }
            }
          ]
        })
        expect(error).toBeDefined()
      })

      it('band must be an integer', () => {
        const { error } = validate({
          edps: [
            {
              ...validEdp,
              impact: {
                nitrogenTotal: {
                  ...validImpactMeasurement,
                  band: { min: 1.5, max: 2 }
                },
                phosphorusTotal: validImpactMeasurement
              }
            }
          ]
        })
        expect(error).toBeDefined()
      })
    })
  })

  describe('levyGbp', () => {
    it('is required', () => {
      const { levyGbp: _, ...rest } = validEdp
      const { error } = validate({ edps: [rest] })
      expect(error).toBeDefined()
    })

    it('requires amountExcludingVat', () => {
      const { amountExcludingVat: _, ...rest } = validEdp.levyGbp
      const { error } = validate({
        edps: [{ ...validEdp, levyGbp: rest }]
      })
      expect(error).toBeDefined()
    })

    it('requires amountInflationAdjusted', () => {
      const { amountInflationAdjusted: _, ...rest } = validEdp.levyGbp
      const { error } = validate({
        edps: [{ ...validEdp, levyGbp: rest }]
      })
      expect(error).toBeDefined()
    })

    it('requires baseAmount', () => {
      const { baseAmount: _, ...rest } = validEdp.levyGbp
      const { error } = validate({
        edps: [{ ...validEdp, levyGbp: rest }]
      })
      expect(error).toBeDefined()
    })

    it('requires modelVersion', () => {
      const { modelVersion: _, ...rest } = validEdp.levyGbp
      const { error } = validate({
        edps: [{ ...validEdp, levyGbp: rest }]
      })
      expect(error).toBeDefined()
    })

    it('accepts decimal values to 2 places', () => {
      const { error } = validate({
        edps: [
          {
            ...validEdp,
            levyGbp: { ...validEdp.levyGbp, amountExcludingVat: 10.55 }
          }
        ]
      })
      expect(error).toBeUndefined()
    })

    it('rejects negative values', () => {
      const { error } = validate({
        edps: [
          {
            ...validEdp,
            levyGbp: { ...validEdp.levyGbp, amountExcludingVat: -1 }
          }
        ]
      })
      expect(error).toBeDefined()
    })

    it('requires modelVersion to be an integer', () => {
      const { error } = validate({
        edps: [
          { ...validEdp, levyGbp: { ...validEdp.levyGbp, modelVersion: 1.5 } }
        ]
      })
      expect(error).toBeDefined()
    })

    it('rejects modelVersion of 0', () => {
      const { error } = validate({
        edps: [
          { ...validEdp, levyGbp: { ...validEdp.levyGbp, modelVersion: 0 } }
        ]
      })
      expect(error).toBeDefined()
    })

    it('rejects a negative modelVersion', () => {
      const { error } = validate({
        edps: [
          { ...validEdp, levyGbp: { ...validEdp.levyGbp, modelVersion: -1 } }
        ]
      })
      expect(error).toBeDefined()
    })
  })
})
