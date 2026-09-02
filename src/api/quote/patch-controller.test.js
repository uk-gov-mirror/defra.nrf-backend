import { randomUUID } from 'node:crypto'

import { audit } from '@defra/cdp-auditing'
import { createNotifyClient } from '../../services/send-email/notify-client.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import { validEdpsPayload } from '../../test-utils/fixtures/quotePayloads.js'
import {
  createQuote,
  sendGetRequest,
  sendPatchRequest,
  issueAccessToken,
  getAccessTokenRowsForReference,
  getEmailNotificationRowsForReference
} from '../../test-utils/quote-request-helpers.js'

vi.mock('@defra/cdp-auditing')
vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

describe('Patch quote endpoint', () => {
  const getServer = setupTestServer()
  let notifySendEmail

  beforeEach(() => {
    // Each accepted send returns a fresh Notify notification UUID — the id is
    // now persisted to a UUID column, so a single hard-coded value would
    // collide across quotes under the UNIQUE constraint.
    notifySendEmail = vi
      .fn()
      .mockImplementation(async () => ({ data: { id: randomUUID() } }))
    vi.mocked(createNotifyClient).mockReturnValue({
      sendEmail: notifySendEmail
    })
  })

  const getQuote = async (reference) => {
    const bearerToken = await issueAccessToken({
      server: getServer(),
      reference
    })
    const response = await sendGetRequest({
      server: getServer(),
      reference,
      bearerToken
    })
    return JSON.parse(response.payload).quote
  }

  it('should return 200 when EDP results are saved successfully', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    const response = await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })

    expect(response.statusCode).toBe(statusCodes.ok)
  })

  it('should send a quote email', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })

    expect(notifySendEmail).toHaveBeenCalled()
  })

  it('should include a quote access link in the email', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })

    const emailOptions = notifySendEmail.mock.calls[0][2]
    expect(emailOptions.personalisation.quoteAccessLink).toMatch(
      new RegExp(`/quote/${reference}/[A-Za-z0-9_-]{43}$`)
    )
  })

  it('should expose the email send date from the recorded notification', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })

    const { email } = await getQuote(reference)

    expect(email.sendRequestAt).not.toBeNull()
    expect(new Date(email.sendRequestAt).getTime()).not.toBeNaN()
  })

  it('should record the Notify notification id so its status can be polled', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })

    const rows = await getEmailNotificationRowsForReference({
      server: getServer(),
      reference
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].email_type).toBe('quote_result')
    expect(rows[0].notification_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(rows[0].status).toBeNull()
  })

  it('should return the saved EDPs when the quote is retrieved after patching', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })

    const { edps, levyGbp } = await getQuote(reference)

    expect(edps).toEqual([
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
          amountExcludingVat: '1100.00',
          amountInflationAdjusted: '1122.00',
          baseAmount: '1000.00',
          modelVersion: 1
        }
      }
    ])
    expect(levyGbp).toEqual({
      levyAmountExcludingVat: 1100,
      levyAmountInflationAdjusted: 1122
    })
  })

  it('should return 404 when the quote reference does not exist', async () => {
    const response = await sendPatchRequest({
      server: getServer(),
      reference: 'NRL-999999',
      payload: validEdpsPayload
    })

    expect(response.statusCode).toBe(statusCodes.notFound)
  })

  it('should audit the update-quote event with the fully updated quote', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    await sendPatchRequest({
      server: getServer(),
      reference,
      payload: validEdpsPayload
    })

    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          category: 'quote',
          action: 'update-quote',
          actor: { type: 'impact-assessor' }
        },
        context: {
          quote: expect.objectContaining({
            reference,
            edps: expect.arrayContaining([
              expect.objectContaining({ edpId: validEdpsPayload.edps[0].edpId })
            ])
          })
        }
      })
    )
  })

  it('should return 400 when edps is missing', async () => {
    const postResponse = await createQuote(getServer())
    const { reference } = JSON.parse(postResponse.payload)

    const response = await sendPatchRequest({
      server: getServer(),
      reference,
      payload: {}
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })

  it('should return 400 when the reference format is invalid', async () => {
    const response = await sendPatchRequest({
      server: getServer(),
      reference: 'INVALID',
      payload: validEdpsPayload
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })

  describe('when duplicate PATCH callbacks race for the same reference', () => {
    const liveTokens = (rows) =>
      rows.filter((row) => new Date(row.expires_at).getTime() > Date.now())

    it('issues a single live token so the emailed link stays valid', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)

      const [first, second] = await Promise.all([
        sendPatchRequest({
          server: getServer(),
          reference,
          payload: validEdpsPayload
        }),
        sendPatchRequest({
          server: getServer(),
          reference,
          payload: validEdpsPayload
        })
      ])

      expect(first.statusCode).toBe(statusCodes.ok)
      expect(second.statusCode).toBe(statusCodes.ok)

      const tokenRows = await getAccessTokenRowsForReference({
        server: getServer(),
        reference
      })
      expect(tokenRows).toHaveLength(1)
      expect(liveTokens(tokenRows)).toHaveLength(1)
    })

    it('sends only one email', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)

      await Promise.all([
        sendPatchRequest({
          server: getServer(),
          reference,
          payload: validEdpsPayload
        }),
        sendPatchRequest({
          server: getServer(),
          reference,
          payload: validEdpsPayload
        })
      ])

      expect(notifySendEmail).toHaveBeenCalledTimes(1)
    })
  })

  describe('when a second PATCH request is sent for the same reference', () => {
    it('should not send an email when no EDP fields have changed', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })
      notifySendEmail.mockClear()

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })

      expect(notifySendEmail).not.toHaveBeenCalled()
    })

    it('should send an email when an EDP field has changed', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })
      notifySendEmail.mockClear()

      const updatedPayload = {
        edps: [
          {
            ...validEdpsPayload.edps[0],
            levyGbp: {
              ...validEdpsPayload.edps[0].levyGbp,
              amountInflationAdjusted: 150
            }
          }
        ]
      }

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: updatedPayload
      })

      expect(notifySendEmail).toHaveBeenCalled()
    })

    it('should update the email sent date when an EDP field has changed', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })

      const firstSentAt = (await getQuote(reference)).email.sendRequestAt

      const updatedPayload = {
        edps: [
          {
            ...validEdpsPayload.edps[0],
            levyGbp: {
              ...validEdpsPayload.edps[0].levyGbp,
              amountInflationAdjusted: 150
            }
          }
        ]
      }

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: updatedPayload
      })

      const secondSentAt = (await getQuote(reference)).email.sendRequestAt

      expect(secondSentAt).not.toBeNull()
      expect(new Date(secondSentAt).getTime()).not.toBeNaN()
      expect(secondSentAt).not.toBe(firstSentAt)
    })

    it('should not update the email sent date when no EDP fields have changed', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })

      const firstSentAt = (await getQuote(reference)).email.sendRequestAt

      await sendPatchRequest({
        server: getServer(),
        reference,
        payload: validEdpsPayload
      })

      const secondSentAt = (await getQuote(reference)).email.sendRequestAt

      expect(secondSentAt).toBe(firstSentAt)
    })
  })
})
