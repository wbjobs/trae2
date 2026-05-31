import app from './app.js'
import { getDatabase } from './src/db/index.js'
import config from './src/config/index.js'

async function start() {
  try {
    await getDatabase()
    console.log('Database initialized')

    const server = app.listen(config.port, () => {
      console.log(`Server ready on port ${config.port}`)
    })

    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received')
      server.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })

    process.on('SIGINT', () => {
      console.log('SIGINT signal received')
      server.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

start()

export default app
