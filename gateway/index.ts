import express from 'express'
import cors from 'cors'
import gatewayHandler from './simple-gateway'

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Wrapper to adapt Express req/res to a Fetch API-style handler
const adaptRequest = (handler: (req: Request) => Promise<Response>) => {
  return async (req: express.Request, res: express.Response) => {
    try {
      // Reconstruct the full URL
      const url = new URL(
        req.originalUrl,
        `${req.protocol}://${req.get('host')}`,
      )

      // Create a Fetch API Request object
      const fetchRequest = new Request(url, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
      })

      // Call the original handler
      const fetchResponse = await handler(fetchRequest)

      // Send the response back through Express
      res.status(fetchResponse.status)
      fetchResponse.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })
      const responseBody = await fetchResponse.json()
      res.json(responseBody)
    } catch (e: any) {
      console.error('[GW] Express adapter error:', e)
      res.status(500).json({ message: e.message || 'Internal Server Error' })
    }
  }
}

// Define routes
app.post('/', adaptRequest(gatewayHandler))
app.get('/:sender/:data', adaptRequest(gatewayHandler))
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Start server
const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log(
    `🌐 ENS CCIP-Read Gateway (Express) Server listening on port ${PORT}`,
  )
  console.log(`🔗 GET /:sender/:data`)
  console.log(`🔗 POST /`)
  console.log(`�� GET /health`)
})
