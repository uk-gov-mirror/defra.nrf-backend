import { createNotifyClient } from '../../services/send-email/notify-client.js'
import { statusCodes } from '../../common/constants/status-codes.js'
import { config } from '../../config.js'
import { setupTestServer } from '../../test-utils/setup-test-server.js'
import {
  createQuote,
  createQuoteWithEdps,
  sendGetRequest,
  issueAccessToken,
  getAccessTokenRow
} from '../../test-utils/quote-request-helpers.js'

vi.mock('../../services/send-email/notify-client.js')
vi.mock('../../services/sns/publish-event.js')

describe('Get quote endpoint', () => {
  const getServer = setupTestServer()

  beforeEach(() => {
    vi.mocked(createNotifyClient).mockReturnValue({
      sendEmail: vi.fn().mockResolvedValue({ data: { id: 'notify-id' } })
    })
  })

  const createQuoteWithToken = async (server) => {
    const postResponse = await createQuote(server)
    const { reference } = JSON.parse(postResponse.payload)
    const token = await issueAccessToken({ server, reference })
    return { reference, token }
  }

  describe('with a valid token', () => {
    it('should return the totalled levyGbp when the quote has EDPs', async () => {
      const reference = await createQuoteWithEdps(getServer())
      const token = await issueAccessToken({ server: getServer(), reference })

      const response = await sendGetRequest({
        server: getServer(),
        reference,
        bearerToken: token
      })

      const { accessStatus, quote } = JSON.parse(response.payload)
      expect(accessStatus).toBe('valid')
      expect(quote.edps).toHaveLength(1)
      expect(quote.levyGbp).toEqual({
        levyAmountExcludingVat: 1100,
        levyAmountInflationAdjusted: 1122
      })
    })

    it('should consume a session on redemption', async () => {
      const { reference, token } = await createQuoteWithToken(getServer())

      await sendGetRequest({
        server: getServer(),
        reference,
        bearerToken: token
      })

      const row = await getAccessTokenRow({
        server: getServer(),
        rawToken: token
      })
      expect(row.session_count).toBe(1)
      expect(row.first_viewed_at).not.toBeNull()
      expect(row.last_viewed_at).not.toBeNull()
    })
  })

  describe('with an invalid token', () => {
    it('should return status invalid when the Authorization header is missing', async () => {
      const { reference } = await createQuoteWithToken(getServer())

      const response = await sendGetRequest({ server: getServer(), reference })

      expect(response.statusCode).toBe(statusCodes.ok)
      const body = JSON.parse(response.payload)
      expect(body.accessStatus).toBe('invalid')
      expect(body.quote).toBeNull()
    })

    it('should return status invalid when the token does not match any row', async () => {
      const { reference } = await createQuoteWithToken(getServer())

      const response = await sendGetRequest({
        server: getServer(),
        reference,
        bearerToken: 'a-token-that-was-never-issued'
      })

      expect(JSON.parse(response.payload).accessStatus).toBe('invalid')
    })

    it('should return status invalid when the token belongs to a different quote', async () => {
      const first = await createQuoteWithToken(getServer())
      const second = await createQuoteWithToken(getServer())

      const response = await sendGetRequest({
        server: getServer(),
        reference: second.reference,
        bearerToken: first.token
      })

      expect(JSON.parse(response.payload).accessStatus).toBe('invalid')
    })
  })

  describe('with an expired or exhausted token', () => {
    it('should return status expired when the token has expired', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)
      const token = await issueAccessToken({
        server: getServer(),
        reference,
        expiresAt: new Date(Date.now() - 1000).toISOString()
      })

      const response = await sendGetRequest({
        server: getServer(),
        reference,
        bearerToken: token
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      const body = JSON.parse(response.payload)
      expect(body.accessStatus).toBe('expired')
      expect(body.quote).toBeNull()
    })

    it('should return status invalid when the session budget is exhausted but the token has not yet expired', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)
      const token = await issueAccessToken({
        server: getServer(),
        reference,
        sessionCount: 5,
        maxSessions: 5
      })

      const response = await sendGetRequest({
        server: getServer(),
        reference,
        bearerToken: token
      })

      expect(JSON.parse(response.payload).accessStatus).toBe('invalid')
    })
  })

  describe('with redeem=false (read without consuming a session)', () => {
    it('should return the quote without incrementing the session count', async () => {
      const { reference, token } = await createQuoteWithToken(getServer())

      const response = await sendGetRequest({
        server: getServer(),
        reference,
        bearerToken: token,
        redeem: false
      })

      expect(JSON.parse(response.payload).accessStatus).toBe('valid')

      const row = await getAccessTokenRow({
        server: getServer(),
        rawToken: token
      })
      expect(row.session_count).toBe(0)
      expect(row.first_viewed_at).toBeNull()
    })

    it('should return expired when the token is exhausted', async () => {
      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)
      const token = await issueAccessToken({
        server: getServer(),
        reference,
        sessionCount: 5,
        maxSessions: 5
      })

      const response = await sendGetRequest({
        server: getServer(),
        reference,
        bearerToken: token,
        redeem: false
      })

      expect(JSON.parse(response.payload).accessStatus).toBe('expired')
    })

    it('should return invalid when the token does not match the quote', async () => {
      const { reference } = await createQuoteWithToken(getServer())

      const response = await sendGetRequest({
        server: getServer(),
        reference,
        bearerToken: 'a-token-that-was-never-issued',
        redeem: false
      })

      expect(JSON.parse(response.payload).accessStatus).toBe('invalid')
    })
  })

  describe('with requestToUse=true', () => {
    afterEach(() => {
      config.set('cdpEnvironment', 'local')
    })

    it('should return the quote as valid without a bearer token', async () => {
      config.set('cdpEnvironment', 'ext-test')

      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)

      const response = await sendGetRequest({
        server: getServer(),
        reference,
        requestToUse: true
      })

      const body = JSON.parse(response.payload)
      expect(body.accessStatus).toBe('valid')
      expect(body.quote).not.toBeNull()
    })

    it('should not return the quote when cdpEnvironment is prod', async () => {
      config.set('cdpEnvironment', 'prod')

      const postResponse = await createQuote(getServer())
      const { reference } = JSON.parse(postResponse.payload)

      const response = await sendGetRequest({
        server: getServer(),
        reference,
        requestToUse: true
      })

      const body = JSON.parse(response.payload)
      expect(body.accessStatus).toBe('invalid')
      expect(body.quote).toBeNull()
    })
  })

  describe('when the quote reference does not resolve', () => {
    it('should return status not_found for an unknown reference', async () => {
      const response = await sendGetRequest({
        server: getServer(),
        reference: 'NRL-999999',
        bearerToken: 'any-token'
      })

      expect(response.statusCode).toBe(statusCodes.ok)
      const body = JSON.parse(response.payload)
      expect(body.accessStatus).toBe('not_found')
      expect(body.quote).toBeNull()
    })

    it('should return 400 when the reference format is invalid', async () => {
      const response = await sendGetRequest({
        server: getServer(),
        reference: 'INVALID',
        bearerToken: 'any-token'
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
    })
  })
})
