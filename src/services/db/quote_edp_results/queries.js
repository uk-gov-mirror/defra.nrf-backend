/**
 * Inserts the EDP results for a quote, skipping any (quote_id, edp_id) that
 * already exists. Returns the number of rows actually inserted.
 *
 * All rows go in via a single multi-row statement so ON CONFLICT is evaluated
 * atomically for the whole set. The unique constraint on (quote_id, edp_id)
 * then makes concurrent duplicate estimate callbacks safe: the first caller's
 * statement inserts every row, a concurrent duplicate conflicts on all of them
 * and inserts none. Only the caller with a non-zero count issues a token, so a
 * duplicate can't issue a second token that would expire the first — even when
 * a quote has several EDPs (a per-row loop could otherwise let each caller win
 * a different row and both proceed).
 */
/**
 * @param {object} params
 * @param {number} params.quoteId
 * @param {{ edpId: number, edpName: string, edpType: string, impact: object, levyGbp: { amountExcludingVat: number, amountInflationAdjusted: number, baseAmount: number, modelVersion: number } }} params.edp
 * @returns {Array} the column values for one quote_edp_results row, in insert order
 */
const edpRowValues = ({ quoteId, edp }) => [
  quoteId,
  edp.edpId,
  edp.edpName,
  edp.edpType,
  JSON.stringify(edp.impact),
  edp.levyGbp.amountExcludingVat,
  edp.levyGbp.baseAmount,
  edp.levyGbp.amountInflationAdjusted,
  edp.levyGbp.modelVersion
]

export const dbSaveEdpResults = async ({ db, quoteId, edps }) => {
  if (edps.length === 0) {
    return 0
  }

  const params = []
  const rowPlaceholders = edps.map((edp) => {
    const placeholders = edpRowValues({ quoteId, edp }).map((value) => {
      params.push(value)
      return `$${params.length}`
    })
    return `(${placeholders.join(', ')}, NOW())`
  })

  const { rowCount } = await db.query(
    `INSERT INTO quote_edp_results (quote_id, edp_id, edp_name, edp_type, impact, levy_excluding_vat, levy_base_amount, levy_inflation_adjusted, levy_model_version, created_at)
     VALUES ${rowPlaceholders.join(', ')}
     ON CONFLICT (quote_id, edp_id) DO NOTHING`,
    params
  )

  return rowCount
}

export const dbGetEdpResults = async ({ db, quoteId }) => {
  const { rows } = await db.query(
    'SELECT * FROM quote_edp_results WHERE quote_id = $1',
    [quoteId]
  )
  return rows
}

export const dbUpdateEdpResult = async ({ db, quoteId, edpId, edp }) => {
  const { edpName, edpType, impact, levyGbp } = edp
  await db.query(
    `UPDATE quote_edp_results
     SET edp_name = $1, edp_type = $2, impact = $3, levy_excluding_vat = $4, levy_base_amount = $5, levy_inflation_adjusted = $6, levy_model_version = $7, updated_at = NOW()
     WHERE quote_id = $8 AND edp_id = $9`,
    [
      edpName,
      edpType,
      JSON.stringify(impact),
      levyGbp.amountExcludingVat,
      levyGbp.baseAmount,
      levyGbp.amountInflationAdjusted,
      levyGbp.modelVersion,
      quoteId,
      edpId
    ]
  )
}
