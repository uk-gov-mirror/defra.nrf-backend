import { retryFailedQuoteEmails } from './retry-failed-quote-emails.js'
import { dbGetRetryableEmailFailures } from '../db/quote-email-notifications/get-retryable-email-failures.js'
import { dbCreateEmailNotification } from '../db/quote-email-notifications/create-email-notification.js'
import { dbGetQuoteById } from '../db/quotes/get-quote-by-id.js'
import { dbIssueQuoteAccessToken } from '../db/quote-access-tokens/issue-quote-access-token.js'
import { sendQuoteEmail } from '../../api/quote/helpers/send-quote-email.js'
import { config } from '../../config.js'

vi.mock('../db/quote-email-notifications/get-retryable-email-failures.js')
vi.mock('../db/quote-email-notifications/create-email-notification.js')
vi.mock('../db/quotes/get-quote-by-id.js')
vi.mock('../db/quote-access-tokens/issue-quote-access-token.js')
vi.mock('../../api/quote/helpers/send-quote-email.js')

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
}))
vi.mock('../../common/helpers/logging/logger.js', () => ({
  createLogger: vi.fn(() => mockLogger)
}))

// A pooled client whose every `query` resolves with the given lock outcome.
// The worker only inspects the first query's result; the unlock query result is
// unused. `pool.connect` resolves to this client so the session-level advisory
// lock spans the run.
const makePool = (locked = true) => {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [{ locked }] }),
    release: vi.fn()
  }
  return { pool: { connect: vi.fn().mockResolvedValue(client) }, client }
}

const makeQuote = (id) => ({
  id,
  reference: `NRF-00000${id}`,
  planningType: 'full-planning-permission',
  housingUnits: 5,
  email: { address: 'adeola@example.com' },
  edps: [
    {
      edpName: 'Norfolk Fens east',
      levyGbp: {
        amountExcludingVat: 1100,
        amountInflationAdjusted: 1122,
        baseAmount: 1000,
        modelVersion: 1
      }
    }
  ]
})

describe('retryFailedQuoteEmails', () => {
  beforeEach(() => {
    dbGetQuoteById.mockImplementation(async ({ id }) => makeQuote(id))
    dbIssueQuoteAccessToken.mockResolvedValue(undefined)
    dbCreateEmailNotification.mockResolvedValue(undefined)
    sendQuoteEmail.mockResolvedValue({
      notificationId: 'notify-id',
      sentDateTime: '2026-08-18T00:00:00.000Z'
    })
  })

  it('claims the lock and re-sends each failed email with a fresh link and attempt-scoped reference', async () => {
    const { pool, client } = makePool(true)
    dbGetRetryableEmailFailures.mockResolvedValue([
      { quote_id: 42, retry_count: 0 },
      { quote_id: 43, retry_count: 3 }
    ])

    await retryFailedQuoteEmails({ pool })

    const { batchSize, maxRetryAttempts, maxAgeDays } =
      config.get('notify.emailRetry')
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_try_advisory_lock')
    )
    expect(dbGetRetryableEmailFailures).toHaveBeenCalledWith({
      db: client,
      limit: batchSize,
      maxRetryAttempts,
      maxAgeDays
    })

    expect(sendQuoteEmail).toHaveBeenCalledTimes(2)
    expect(sendQuoteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        db: client,
        quoteId: 42,
        emailType: 'retry',
        recipientEmailAddress: 'adeola@example.com',
        nrfQuoteReference: 'NRF-0000042',
        emailReference: 'NRF-0000042-retry-1',
        quoteAccessLink: expect.stringMatching(
          /\/quote\/NRF-0000042\/[A-Za-z0-9_-]{43}$/
        )
      })
    )
    expect(sendQuoteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: 43,
        emailReference: 'NRF-0000043-retry-4'
      })
    )
    expect(dbIssueQuoteAccessToken).toHaveBeenCalledTimes(2)
    expect(dbCreateEmailNotification).not.toHaveBeenCalled()
  })

  it('releases the client and advisory lock in finally', async () => {
    const { pool, client } = makePool(true)
    dbGetRetryableEmailFailures.mockResolvedValue([])

    await retryFailedQuoteEmails({ pool })

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock')
    )
    expect(client.release).toHaveBeenCalled()
  })

  it('skips the tick when another instance holds the lock', async () => {
    const { pool, client } = makePool(false)

    await retryFailedQuoteEmails({ pool })

    expect(dbGetRetryableEmailFailures).not.toHaveBeenCalled()
    expect(sendQuoteEmail).not.toHaveBeenCalled()
    // still releases its own client
    expect(client.release).toHaveBeenCalled()
  })

  it('counts a Notify rejection against the retry budget and still runs the rest of the batch', async () => {
    const { pool, client } = makePool(true)
    dbGetRetryableEmailFailures.mockResolvedValue([
      { quote_id: 42, retry_count: 0 },
      { quote_id: 43, retry_count: 0 }
    ])
    sendQuoteEmail.mockResolvedValueOnce(null).mockResolvedValueOnce({
      notificationId: 'notify-id-2',
      sentDateTime: '2026-08-18T00:00:00.000Z'
    })

    await retryFailedQuoteEmails({ pool })

    expect(sendQuoteEmail).toHaveBeenCalledTimes(2)
    // Only the rejected send records a 'retry_rejected' attempt row
    expect(dbCreateEmailNotification).toHaveBeenCalledTimes(1)
    expect(dbCreateEmailNotification).toHaveBeenCalledWith({
      db: client,
      quoteId: 42,
      notificationId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      ),
      emailType: 'retry_rejected'
    })
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: 42, attemptNo: 1 }),
      expect.any(String)
    )
  })

  it('skips a quote that no longer exists without sending', async () => {
    const { pool } = makePool(true)
    dbGetRetryableEmailFailures.mockResolvedValue([
      { id: 1, quote_id: 42, notification_id: 'uuid-1', retry_count: 0 }
    ])
    dbGetQuoteById.mockResolvedValue(null)

    await retryFailedQuoteEmails({ pool })

    expect(sendQuoteEmail).not.toHaveBeenCalled()
    expect(dbIssueQuoteAccessToken).not.toHaveBeenCalled()
    expect(dbCreateEmailNotification).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: 42 }),
      expect.any(String)
    )
  })

  it('aborts the batch when a quote load fails, so a dead connection wastes no further Notify sends', async () => {
    const { pool } = makePool(true)
    dbGetRetryableEmailFailures.mockResolvedValue([
      { quote_id: 42, retry_count: 0 },
      { quote_id: 43, retry_count: 0 }
    ])
    dbGetQuoteById.mockRejectedValue(new Error('connection terminated'))

    await retryFailedQuoteEmails({ pool })

    // Row 1's DB read failed -> the connection is presumed dead, so the loop
    // breaks and row 2 is never loaded or sent.
    expect(dbGetQuoteById).toHaveBeenCalledTimes(1)
    expect(sendQuoteEmail).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: 42 }),
      expect.any(String)
    )
  })

  it('still releases the client when the advisory-unlock query rejects', async () => {
    const { pool, client } = makePool(true)
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('pg_advisory_unlock')) {
        throw new Error('connection terminated')
      }
      return { rows: [{ locked: true }] }
    })
    dbGetRetryableEmailFailures.mockResolvedValue([])

    await retryFailedQuoteEmails({ pool })

    // The dead client is released with the error so pg-pool destroys it rather
    // than returning it to the pool for reuse.
    expect(client.release).toHaveBeenCalledWith(expect.any(Error))
  })
})
