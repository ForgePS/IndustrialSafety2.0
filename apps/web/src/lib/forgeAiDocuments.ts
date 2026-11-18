// Forge Knowledge document handling: file-type detection, text extraction (PDF, DOCX, Markdown,
// plain text) and hybrid result ranking. Parsers load lazily so this module stays loadable by
// Node tests and parsers only run on the server when a file is uploaded.

export const KNOWLEDGE_MAX_FILE_BYTES = 10 * 1024 * 1024
export const KNOWLEDGE_MAX_TEXT_CHARS = 500_000

export type KnowledgeDocumentKind = 'pdf' | 'docx' | 'markdown' | 'text'

export type ExtractedDocument = {
  kind: KnowledgeDocumentKind
  text: string
  pageCount: number | null
  warnings: string[]
}

export class KnowledgeDocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KnowledgeDocumentError'
  }
}

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((value, index) => bytes[index] === value)

// Decide by content first (magic bytes), then extension. The browser-supplied MIME type is not trusted.
export const detectKnowledgeDocumentKind = (bytes: Uint8Array, fileName: string): KnowledgeDocumentKind | null => {
  const extension = fileName.toLowerCase().split('.').pop() || ''

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf' // %PDF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return extension === 'docx' ? 'docx' : null // zip container
  if (extension === 'pdf' || extension === 'docx') return null // claims a binary type but the bytes disagree

  // Text formats: must decode as UTF-8 without NUL bytes.
  if (bytes.includes(0)) return null
  if (extension === 'md' || extension === 'markdown') return 'markdown'
  if (extension === 'txt' || extension === 'text' || extension === 'csv') return 'text'

  return null
}

export const normalizeExtractedText = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t\f\v]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()

export const extractKnowledgeDocument = async (bytes: Uint8Array, fileName: string): Promise<ExtractedDocument> => {
  if (bytes.byteLength === 0) throw new KnowledgeDocumentError('The file is empty.')
  if (bytes.byteLength > KNOWLEDGE_MAX_FILE_BYTES) throw new KnowledgeDocumentError('Files must be 10 MB or smaller.')

  const kind = detectKnowledgeDocumentKind(bytes, fileName)

  if (!kind) throw new KnowledgeDocumentError('Upload a PDF, Word (.docx), Markdown or plain-text file.')

  const warnings: string[] = []
  let text = ''
  let pageCount: number | null = null

  if (kind === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf')
    let pdf: any

    try {
      pdf = await getDocumentProxy(new Uint8Array(bytes))
    } catch {
      throw new KnowledgeDocumentError('This PDF could not be read. It may be damaged or password-protected.')
    }

    const result = await extractText(pdf, { mergePages: false })
    const pages: string[] = Array.isArray(result.text) ? result.text : [String(result.text || '')]

    pageCount = result.totalPages
    // Page markers let chunks keep page references for citations.
    text = pages.map((page, index) => `[[page ${index + 1}]]\n${page}`).join('\n\n')
    if (!pages.join('').trim()) {
      throw new KnowledgeDocumentError('No text was found in this PDF. Scanned PDFs need OCR before they can be indexed.')
    }
  } else if (kind === 'docx') {
    const mammoth = await import('mammoth')
    const extractRawText = (mammoth as any).extractRawText || (mammoth as any).default?.extractRawText
    let result: any

    try {
      result = await extractRawText({ buffer: Buffer.from(bytes) })
    } catch {
      throw new KnowledgeDocumentError('This Word document could not be read.')
    }

    text = String(result.value || '')
    for (const message of result.messages || []) {
      if (message?.type === 'warning') warnings.push(String(message.message).slice(0, 200))
    }
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new KnowledgeDocumentError('Text files must be UTF-8 encoded.')
    }
  }

  text = normalizeExtractedText(text)

  if (!text.replace(/\[\[page \d+\]\]/g, '').trim()) throw new KnowledgeDocumentError('No readable text was found in this file.')
  if (text.length > KNOWLEDGE_MAX_TEXT_CHARS) {
    throw new KnowledgeDocumentError('This document has more than 500,000 characters of text. Split it into smaller sources.')
  }

  return { kind, text, pageCount, warnings: warnings.slice(0, 5) }
}

// Page number for a chunk taken from text carrying [[page N]] markers: the last marker at or
// before the chunk's start.
export const pageForOffset = (text: string, offset: number) => {
  let page: number | null = null

  for (const match of text.matchAll(/\[\[page (\d+)\]\]/g)) {
    if ((match.index ?? 0) > offset) break
    page = Number(match[1])
  }

  return page
}

export type RankedKnowledgeHit = { chunk_id: number | string; [key: string]: unknown }

// Reciprocal rank fusion of full-text and vector results: robust to their different score scales.
export const fuseKnowledgeResults = <T extends RankedKnowledgeHit>(lexical: T[], semantic: T[], limit: number, k = 60) => {
  const merged = new Map<string, { item: T; score: number; matchedBy: string[] }>()

  const add = (list: T[], label: string) =>
    list.forEach((item, index) => {
      const key = String(item.chunk_id)
      const entry = merged.get(key) || { item, score: 0, matchedBy: [] }

      entry.score += 1 / (k + index + 1)
      entry.matchedBy.push(label)
      merged.set(key, entry)
    })

  add(lexical, 'text')
  add(semantic, 'semantic')

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(entry => ({ ...entry.item, relevance: Math.round(entry.score * 10000) / 10000, matched_by: entry.matchedBy }))
}
