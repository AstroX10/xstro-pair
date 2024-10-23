import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import archiver from 'archiver'
import path from 'path'

export const upload = async folderPath => {
  const zipPath = path.join(process.cwd(), 'temp.zip')
  const output = fs.createWriteStream(zipPath)
  const archive = archiver('zip')

  return new Promise(async (resolve, reject) => {
    output.on('close', async () => {
      const form = new FormData()
      form.append('file', fs.createReadStream(zipPath))

      try {
        const res = await axios.post(
          'https://session-jvu4.onrender.com/api/upload',
          form,
          {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          }
        )
        resolve(res.data)
      } catch (err) {
        console.error('Error:', err.response ? err.response.data : err.message)
        reject(err)
      } finally {
        fs.unlinkSync(zipPath)
      }
    })

    archive.on('error', err => {
      reject(err)
    })

    archive.pipe(output)
    archive.directory(folderPath, false)
    await archive.finalize()
  })
}
