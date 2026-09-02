import joi from 'joi'

const currencySchema = joi.number().precision(2).min(0).required()

const bandSchema = joi.number().integer().min(1).max(4).required()

const impactMeasurementSchema = joi.object({
  amount: joi.number().precision(2).required(),
  unit: joi.string().valid('mg/I TP').required(),
  band: joi.object({
    min: bandSchema,
    max: bandSchema
  })
})

export const patchSchema = joi.object({
  edps: joi
    .array()
    .items(
      joi.object({
        edpId: joi.number().integer().required(),
        edpName: joi.string().required(),
        edpType: joi.string().valid('NUTRIENT').required(),
        impact: joi
          .object({
            nitrogenTotal: impactMeasurementSchema.required(),
            phosphorusTotal: impactMeasurementSchema.required()
          })
          .required(),
        levyGbp: joi
          .object({
            amountExcludingVat: currencySchema,
            amountInflationAdjusted: currencySchema,
            baseAmount: currencySchema,
            modelVersion: joi.number().integer().min(1).required()
          })
          .required()
      })
    )
    .required()
})
