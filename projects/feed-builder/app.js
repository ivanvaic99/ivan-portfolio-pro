const q = (sel) => document.querySelector(sel)
const fileInput = q('#fileInput')
const fileInfo = q('#fileInfo')
const mappingSec = q('#mapping')
const validationEl = q('#validation')
const btnXml = q('#btnXml')
const btnJson = q('#btnJson')
const downloadLink = q('#downloadLink')

const selects = {
  id: q('#map-id'),
  title: q('#map-title'),
  description: q('#map-description'),
  link: q('#map-link'),
  image: q('#map-image'),
  price: q('#map-price'),
  availability: q('#map-availability'),
  condition: q('#map-condition'),
  brand: q('#map-brand'),
}

const currencySel = q('#currency')
const vatInput = q('#vat')
const defAvail = q('#defaultAvailability')
const defCond = q('#defaultCondition')

let rows = []
let headers = []

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0]
  if (!f) return
  Papa.parse(f, {
    header: true,
    skipEmptyLines: true,
    complete: (res) => {
      rows = res.data || []
      headers = res.meta?.fields || []
      fileInfo.textContent = `${f.name} — ${rows.length} rows, ${headers.length} columns`
      buildMappingUI(headers)
      mappingSec.classList.remove('hidden')
      validationEl.textContent = ''
    },
    error: (err) => {
      fileInfo.textContent = 'Parse error: ' + err.message
    }
  })
})

function buildMappingUI(fields) {
  const options = ['<option value="">— choose —</option>'].concat(
    fields.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`)
  ).join('')

  for (const key of Object.keys(selects)) {
    selects[key].innerHTML = options
  }

  // naive auto-match
  autoSelect('id', ['id', 'sku'])
  autoSelect('title', ['title', 'name', 'product_name'])
  autoSelect('description', ['description', 'desc', 'short_description'])
  autoSelect('link', ['link', 'url', 'product_url', 'permalink'])
  autoSelect('image', ['image', 'image_link', 'image_url', 'featured_image'])
  autoSelect('price', ['price', 'regular_price', 'sale_price'])
  autoSelect('availability', ['availability', 'stock_status'])
  autoSelect('condition', ['condition'])
  autoSelect('brand', ['brand'])
}
function autoSelect(key, candidates) {
  const idx = candidates.findIndex(c => headers.some(h => h.toLowerCase() === c))
  if (idx >= 0) {
    const val = headers.find(h => h.toLowerCase() === candidates[idx])
    selects[key].value = val
  }
}

btnXml.addEventListener('click', () => {
  const map = getMapping()
  const errors = validate(map)
  if (errors.length) {
    validationEl.textContent = 'Please fix: ' + errors.join(', ')
    return
  }
  const xml = buildXml(rows, map)
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  downloadLink.href = url
  downloadLink.download = 'feed.xml'
  downloadLink.classList.remove('hidden')
  downloadLink.textContent = 'Download XML'
  validationEl.textContent = 'XML is ready.'
})

btnJson.addEventListener('click', () => {
  const map = getMapping()
  const errors = validate(map)
  if (errors.length) {
    validationEl.textContent = 'Please fix: ' + errors.join(', ')
    return
  }
  const items = buildItems(rows, map)
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'feed.json'
  a.click()
  URL.revokeObjectURL(url)
})

function getMapping() {
  return {
    id: selects.id.value || '',
    title: selects.title.value || '',
    description: selects.description.value || '',
    link: selects.link.value || '',
    image: selects.image.value || '',
    price: selects.price.value || '',
    availability: selects.availability.value || '',
    condition: selects.condition.value || '',
    brand: selects.brand.value || '',
    currency: currencySel.value,
    vat: parseFloat(vatInput.value || '0') || 0,
    defaultAvailability: defAvail.value || '',
    defaultCondition: defCond.value || '',
  }
}
function validate(map) {
  const req = ['id','title','link','image','price']
  const missing = req.filter(k => !map[k])
  const problems = []
  if (missing.length) problems.push('mapping for: ' + missing.join(', '))
  if (!rows.length) problems.push('no CSV rows')
  return problems
}

function buildItems(rows, map) {
  return rows.map((r, i) => {
    const priceNum = parsePrice(r[map.price])
    const finalPrice = applyVat(priceNum, map.vat)
    return {
      id: getVal(r, map.id, i),
      title: getVal(r, map.title, i),
      description: map.description ? String(r[map.description] ?? '') : '',
      link: getVal(r, map.link, i),
      image_link: getVal(r, map.image, i),
      price: formatPrice(finalPrice, map.currency),
      availability: (map.availability && (r[map.availability] ?? '') || map.defaultAvailability || '').toLowerCase(),
      condition: (map.condition && (r[map.condition] ?? '') || map.defaultCondition || '').toLowerCase(),
      brand: map.brand ? String(r[map.brand] ?? '') : '',
    }
  })
}

function buildXml(rows, map) {
  const items = buildItems(rows, map)
  const esc = (s) => escapeXml(s ?? '')
  const lines = []
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  lines.push(`<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">`)
  lines.push(`<channel>`)
  lines.push(`<title>Product Feed</title>`)
  lines.push(`<link>https://example.com</link>`)
  lines.push(`<description>Generated by Product Feed Builder</description>`)
  for (const it of items) {
    if (!it.id || !it.title || !it.link || !it.image_link || !it.price) continue
    lines.push(`<item>`)
    lines.push(`<g:id>${esc(it.id)}</g:id>`)
    lines.push(`<g:title>${esc(it.title)}</g:title>`)
    if (it.description) lines.push(`<g:description>${esc(it.description)}</g:description>`)
    lines.push(`<g:link>${esc(it.link)}</g:link>`)
    lines.push(`<g:image_link>${esc(it.image_link)}</g:image_link>`)
    lines.push(`<g:price>${esc(it.price)}</g:price>`)
    if (it.availability) lines.push(`<g:availability>${esc(it.availability)}</g:availability>`)
    if (it.condition) lines.push(`<g:condition>${esc(it.condition)}</g:condition>`)
    if (it.brand) lines.push(`<g:brand>${esc(it.brand)}</g:brand>`)
    lines.push(`</item>`)
  }
  lines.push(`</channel>`)
  lines.push(`</rss>`)
  return lines.join('\n')
}

function parsePrice(v) {
  if (v == null) return 0
  let s = String(v).trim()
  s = s.replace(/[^\d,.\-]/g, '')
  // Ako koristiš zarez kao decimalni separator:
  if ((s.match(/,/g) || []).length === 1 && s.indexOf('.') === -1) {
    s = s.replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}
function applyVat(n, vat) {
  if (!vat) return n
  return n * (1 + vat / 100)
}
function formatPrice(n, currency) {
  return `${n.toFixed(2)} ${currency}`
}
function getVal(row, key, idx) {
  const v = row?.[key]
  if (v == null) return ''
  return String(v).trim()
}
function escapeHtml(s) {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;')
}
function escapeXml(s) {
  return escapeHtml(s)
}
