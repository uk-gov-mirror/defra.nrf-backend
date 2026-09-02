import { audit } from '@defra/cdp-auditing'
import Boom from '@hapi/boom'
import { auditEvents } from '../../common/constants/audit-events.js'
import { dbGetQuote } from '../../services/db/quotes/get-quote.js'
import { dbIssueQuoteAccessToken } from '../../services/db/quote-access-tokens/issue-quote-access-token.js'
import { generateToken } from '../../common/helpers/token/generate-token.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { config } from '../../config.js'
import { patchSchema } from './validation/patch-schema.js'
import { referenceParamSchema } from './validation/reference-param-schema.js'
import { sendQuoteEmail } from './helpers/send-quote-email.js'
import { buildQuoteAccessLink } from './helpers/build-quote-access-link.js'
import { saveOrUpdateEdpResults } from './helpers/save-or-update-edp-results.js'

/**
 * @openapi
 * /quotes/{reference}:
 *   patch:
 *     tags:
 *       - Quote
 *     summary: Update a quote by reference
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *           pattern: ^NRL-\d{6}$
 *         example: NRL-000001
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - edps
 *             properties:
 *               edps:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - edpId
 *                     - edpName
 *                     - edpType
 *                     - impact
 *                     - levyGbp
 *                   properties:
 *                     edpId:
 *                       type: integer
 *                     edpName:
 *                       type: string
 *                     edpType:
 *                       type: string
 *                       enum: [NUTRIENT]
 *                     impact:
 *                       type: object
 *                       required:
 *                         - nitrogenTotal
 *                         - phosphorusTotal
 *                       properties:
 *                         nitrogenTotal:
 *                           $ref: '#/components/schemas/ImpactMeasurement'
 *                         phosphorusTotal:
 *                           $ref: '#/components/schemas/ImpactMeasurement'
 *                     levyGbp:
 *                       type: object
 *                       required:
 *                         - amountExcludingVat
 *                         - amountInflationAdjusted
 *                         - baseAmount
 *                         - modelVersion
 *                       properties:
 *                         amountExcludingVat:
 *                           type: number
 *                           format: float
 *                         amountInflationAdjusted:
 *                           type: number
 *                           format: float
 *                         baseAmount:
 *                           type: number
 *                           format: float
 *                         modelVersion:
 *                           type: integer
 *     responses:
 *       200:
 *         description: Quote updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Quote not found
 */
export const patchController = {
  options: {
    validate: {
      params: referenceParamSchema,
      payload: patchSchema
    }
  },
  async handler(request, h) {
    const quote = await dbGetQuote({
      db: request.pg,
      reference: request.params.reference
    })

    if (!quote) {
      return Boom.notFound()
    }
    const {
      id,
      reference,
      email: { address },
      housingUnits,
      planningType,
      disableAnalyticsAudit
    } = quote
    const { edps } = request.payload

    const anyUpdated = await saveOrUpdateEdpResults({
      db: request.pg,
      quoteId: id,
      edps
    })

    if (anyUpdated) {
      const { raw, hash } = generateToken()

      await dbIssueQuoteAccessToken({
        db: request.pg,
        quoteId: id,
        tokenHash: hash
      })

      const frontEndBaseUrl = config.get('frontEndBaseUrl')
      const quoteAccessLink = buildQuoteAccessLink({ reference, rawToken: raw })

      await sendQuoteEmail({
        db: request.pg,
        quoteId: id,
        emailType: 'quote_result',
        nrfQuoteReference: reference,
        nrfServiceUrl: frontEndBaseUrl,
        recipientEmailAddress: address,
        edps,
        housingUnits,
        planningType,
        quoteAccessLink
      })
    }

    const updatedQuote = await dbGetQuote({
      db: request.pg,
      reference
    })

    if (!disableAnalyticsAudit) {
      audit({
        event: {
          category: auditEvents.quote.category,
          action: auditEvents.quote.updateQuote,
          actor: { type: 'impact-assessor' }
        },
        context: { quote: updatedQuote }
      })
    }

    return h.response().code(statusCodes.ok)
  }
}
