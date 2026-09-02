import { sendEmail } from '../../../services/send-email/send-email-client.js'
import { dbCreateEmailNotification } from '../../../services/db/quote-email-notifications/create-email-notification.js'
import { config } from '../../../config.js'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import { getLevyAmount } from './get-levy-amount.js'
import { getPlanningTypeDisplay } from './get-planning-type-display.js'
import { formatCurrency } from '../../../common/helpers/format-currency.js'

const logger = createLogger()

/**
 * @param {object} params
 * @param {{ query: Function }} params.db
 * @param {number} params.quoteId
 * @param {string} [params.emailType='quote_result'] - 'quote_result' | 'resend' | 'retry'
 * @param {string} params.recipientEmailAddress
 * @param {string} params.nrfQuoteReference
 * @param {string} [params.emailReference=nrfQuoteReference] - Notify dedup/reference key for the send; retries pass a suffixed value so a re-send can never be deduplicated against an earlier attempt
 * @param {string} params.nrfServiceUrl
 * @param {Array<{edpName: string, levyGbp: {amountExcludingVat: number, amountInflationAdjusted: number, baseAmount: number, modelVersion: number}}>} params.edps
 * @param {number} params.housingUnits
 * @param {string} params.planningType
 * @param {string} params.quoteAccessLink
 * @returns {Promise<{ notificationId: string, sentDateTime: string } | null>}
 */
export const sendQuoteEmail = async ({
  db,
  quoteId,
  emailType = 'quote_result',
  recipientEmailAddress,
  nrfQuoteReference,
  emailReference = nrfQuoteReference,
  nrfServiceUrl,
  edps,
  housingUnits,
  planningType,
  quoteAccessLink
}) => {
  const { templateIds } = config.get('notify')
  const { levyAmountExcludingVat, levyAmountInflationAdjusted } =
    getLevyAmount(edps)
  const emailResult = await sendEmail({
    recipientEmailAddress,
    emailReference,
    emailBodyVariables: {
      nrfQuoteReference,
      edpNames: edps.map(({ edpName }) => edpName).join(', '),
      housingUnits,
      planningType: getPlanningTypeDisplay(planningType),
      levyAmount: formatCurrency(levyAmountExcludingVat),
      levyAmountInflationAdjusted: formatCurrency(levyAmountInflationAdjusted),
      nrfServiceUrl,
      quoteAccessLink
    },
    templateId: templateIds.quote
  })

  if (emailResult?.notificationId) {
    try {
      await dbCreateEmailNotification({
        db,
        quoteId,
        notificationId: emailResult.notificationId,
        emailType
      })
    } catch (error) {
      logger.error(
        { quoteId, notificationId: emailResult.notificationId, error },
        'Failed to record Notify notification id; email was sent'
      )
    }
  }

  return emailResult
}
