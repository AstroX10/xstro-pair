console.log('✅Server Started...')

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { setupMaster, fork } from 'cluster'
import { watchFile, unwatchFile } from 'fs'
import cfonts from 'cfonts'
import { createInterface } from 'readline'
import yargs from 'yargs'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const { say } = cfonts
const readlineInterface = createInterface(process.stdin, process.stdout)

say('Xstro', {
  font: 'pallet',
  align: 'center',
  gradient: ['red', 'magenta'],
})
say(`pair`, {
  font: 'console',
  align: 'center',
  gradient: ['cyan', 'magenta'],
})

let isProcessRunning = false

function startScript(scriptFile) {
  if (isProcessRunning) return
  isProcessRunning = true
  const scriptArgs = [join(currentDirectory, scriptFile), ...process.argv.slice(2)]
  say([process.argv[0], ...scriptArgs].join(' '), {
    font: 'console',
    align: 'center',
    gradient: ['red', 'magenta'],
  })
  setupMaster({
    exec: scriptArgs[0],
    args: scriptArgs.slice(1),
  })
  const processInstance = fork()
  processInstance.on('message', messageData => {
    console.log('[RECEIVED]', messageData)
    switch (messageData) {
      case 'reset':
        processInstance.process.kill()
        isProcessRunning = false
        startScript.apply(this, arguments)
        break
      case 'uptime':
        processInstance.send(process.uptime())
        break
    }
  })

  processInstance.on('exit', (_, exitCode) => {
    isProcessRunning = false
    console.error('❎An Error occurred:', exitCode)
    if (exitCode === 0) return
    watchFile(scriptArgs[0], () => {
      unwatchFile(scriptArgs[0])
      startScript(scriptFile)
    })
  })

  const options = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())
  if (!options['test'])
    if (!readlineInterface.listenerCount())
      readlineInterface.on('line', inputLine => {
        processInstance.emit('message', inputLine.trim())
      })
}

startScript('index.js')
