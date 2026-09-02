import {
  dbSaveEdpResults,
  dbGetEdpResults,
  dbUpdateEdpResult
} from '../../../services/db/quote_edp_results/queries.js'
const sortedStringify = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
        )
      : v
  )

export const saveOrUpdateEdpResults = async ({ db, quoteId, edps }) => {
  const existingEdpResults = await dbGetEdpResults({ db, quoteId })
  if (existingEdpResults.length === 0) {
    // Concurrent duplicate callbacks both reach here seeing no rows, but the
    // unique (quote_id, edp_id) constraint lets only one INSERT land. The loser
    // inserts nothing and returns false, so it won't issue a second token.
    const inserted = await dbSaveEdpResults({ db, quoteId, edps })
    return inserted > 0
  }

  let anyUpdated = false

  for (const edp of edps) {
    const existing = existingEdpResults.find((r) => r.edp_id === edp.edpId)
    if (!existing) {
      continue
    }

    const impactChanged =
      sortedStringify(existing.impact) !== sortedStringify(edp.impact)

    if (
      existing.edp_name !== edp.edpName ||
      existing.edp_type !== edp.edpType ||
      Number.parseFloat(existing.levy_excluding_vat) !==
        edp.levyGbp.amountExcludingVat ||
      Number.parseFloat(existing.levy_inflation_adjusted) !==
        edp.levyGbp.amountInflationAdjusted ||
      Number.parseFloat(existing.levy_base_amount) !== edp.levyGbp.baseAmount ||
      existing.levy_model_version !== edp.levyGbp.modelVersion ||
      impactChanged
    ) {
      await dbUpdateEdpResult({ db, quoteId, edpId: edp.edpId, edp })
      anyUpdated = true
    }
  }

  return anyUpdated
}
