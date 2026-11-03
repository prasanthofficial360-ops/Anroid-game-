import fs from 'node:fs'

const html = fs.readFileSync('index.html', 'utf8')
const js = fs.readFileSync('src/main.js', 'utf8')
const ids = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]))
const missing = [...ids].filter((id) => !new RegExp(`id=["']${id}["']`).test(html))
const dupes = [...html.matchAll(/id=["']([^"']+)["']/g)].map((m) => m[1])
const seen = new Set()
const duplicateIds = [...new Set(dupes.filter((id) => (seen.has(id) ? true : (seen.add(id), false))))]
console.log(JSON.stringify({ referenced: ids.size, missing, duplicateIds }, null, 2))
