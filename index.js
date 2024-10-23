import { Boom } from '@hapi/boom'
import Baileys, {
  DisconnectReason,
  delay,
  Browsers,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import cors from 'cors'
import express from 'express'
import fs from 'fs'
import path, { dirname } from 'path'
import pino from 'pino'
import { fileURLToPath } from 'url'
import { upload } from './upload.js'

const app = express()

app.use((request, response, next) => {
  response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  response.setHeader('Pragma', 'no-cache')
  response.setHeader('Expires', '0')
  next()
})

app.use(cors())

const PORT = process.env.PORT || 7860
const currentFileName = fileURLToPath(import.meta.url)
const currentDirectoryName = dirname(currentFileName)

app.use(express.static(path.join(currentDirectoryName, 'client', 'build')))

function generateRandomId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let randomId = ''
  for (let index = 0; index < 10; index++) {
    randomId += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return randomId
}

let sessionDirectory = `./auth/${generateRandomId()}`
if (fs.existsSync(sessionDirectory)) {
  try {
    fs.rmdirSync(sessionDirectory, { recursive: true })
    console.log('Deleted the "SESSION" folder.')
  } catch (error) {
    console.error('Error deleting the "SESSION" folder:', error)
  }
}

let clearSessionState = () => {
  fs.rmdirSync(sessionDirectory, { recursive: true })
}

function deleteSessionDirectory() {
  if (!fs.existsSync(sessionDirectory)) {
    console.log('The "SESSION" folder does not exist.')
    return
  }

  try {
    fs.rmdirSync(sessionDirectory, { recursive: true })
    console.log('Deleted the "SESSION" folder.')
  } catch (error) {
    console.error('Error deleting the "SESSION" folder:', error)
  }
}

app.get('/', (request, response) => {
  response.sendFile(path.join(currentDirectoryName, 'client', 'build', 'index.html'))
})

app.get('/pair', async (request, response) => {
  let phoneNumber = request.query.phone

  if (!phoneNumber) return response.json({ error: 'Please Provide Phone Number' })

  try {
    const pairingCode = await initiatePairing(phoneNumber)
    response.json({ code: pairingCode })
  } catch (error) {
    console.error('Error in WhatsApp authentication:', error)
    response.status(500).json({ error: 'Internal Server Error' })
  }
})

async function initiatePairing(phoneNumber) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(sessionDirectory)) {
        await fs.mkdirSync(sessionDirectory)
      }

      const { state, saveCreds } = await useMultiFileAuthState(sessionDirectory)

      const conn = Baileys.makeWASocket({
        version: [2, 3000, 1015901307],
        printQRInTerminal: false,
        logger: pino({
          level: 'silent',
        }),
        browser: Browsers.ubuntu('Chrome'),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino().child({
              level: 'fatal',
              stream: 'store',
            })
          ),
        },
      })

      if (!conn.authState.creds.registered) {
        let sanitizedPhoneNumber = phoneNumber ? phoneNumber.replace(/[^0-9]/g, '') : ''
        if (sanitizedPhoneNumber.length < 11) {
          return reject(new Error('Please Enter Your Number With Country Code !!'))
        }
        setTimeout(async () => {
          try {
            let code = await conn.requestPairingCode(sanitizedPhoneNumber)
            console.log(`Your Pairing Code : ${code}`)
            resolve(code)
          } catch (requestPairingCodeError) {
            const errorMessage = 'Error requesting pairing code from WhatsApp'
            console.error(errorMessage, requestPairingCodeError)
            return reject(new Error(errorMessage))
          }
        }, 3000)
      }

      conn.ev.on('creds.update', saveCreds)

      conn.ev.on('connection.update', async update => {
        const { connection, lastDisconnect } = update

        if (connection === 'open') {
          await delay(10000)
          const res = await upload(sessionDirectory)
          await delay(5000)
          let info = await conn.sendMessage(conn.user.id, {
            text: res.session,
          })
          await conn.sendMessage(
            conn.user.id,
            {
              text: `\`\`\`USERS: ${res.users}\`\`\``,
            },
            { quoted: info }
          )

          console.log('Connected to WhatsApp Servers')

          try {
            deleteSessionDirectory()
          } catch (error) {
            console.error('Error deleting session folder:', error)
          }

          process.send('reset')
        }

        if (connection === 'close') {
          let reason = new Boom(lastDisconnect?.error)?.output.statusCode
          console.log('Connection Closed:', reason)
          if (reason === DisconnectReason.connectionClosed) {
            console.log('[Connection closed, reconnecting....!]')
            process.send('reset')
          } else if (reason === DisconnectReason.connectionLost) {
            console.log('[Connection Lost from Server, reconnecting....!]')
            process.send('reset')
          } else if (reason === DisconnectReason.loggedOut) {
            clearSessionState()
            console.log('[Device Logged Out, Please Try to Login Again....!]')
            process.send('reset')
          } else if (reason === DisconnectReason.restartRequired) {
            console.log('[Server Restarting....!]')
            initiatePairing()
          } else if (reason === DisconnectReason.timedOut) {
            console.log('[Connection Timed Out, Trying to Reconnect....!]')
            process.send('reset')
          } else if (reason === DisconnectReason.badSession) {
            console.log('[BadSession exists, Trying to Reconnect....!]')
            clearSessionState()
            process.send('reset')
          } else if (reason === DisconnectReason.connectionReplaced) {
            console.log(`[Connection Replaced, Trying to Reconnect....!]`)
            process.send('reset')
          } else {
            console.log('[Server Disconnected: Maybe Your WhatsApp Account got Fucked....!]')
            process.send('reset')
          }
        }
      })

      conn.ev.on('messages.upsert', () => {})
    } catch (error) {
      console.error('An Error Occurred:', error)
      throw new Error('An Error Occurred')
    }
  })
}

app.listen(PORT, () => {
  console.log(`API Running on PORT:${PORT}`)
})
