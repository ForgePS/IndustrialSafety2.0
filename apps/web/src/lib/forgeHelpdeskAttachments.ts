import { createHash } from 'node:crypto'

export const HELPDESK_BUCKET = 'forge-support'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic']
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

const DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]

export const HELPDESK_ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES, ...DOCUMENT_TYPES]
export const HELPDESK_ACCEPT = HELPDESK_ALLOWED_TYPES.join(',')

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value)

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.slice(start, start + length))

// Content sniffing so a renamed executable cannot pass as an image or PDF.
const contentMatchesType = (bytes: Uint8Array, mime: string) => {
  switch (mime) {
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff])
    case 'image/gif':
      return ascii(bytes, 0, 4) === 'GIF8'
    case 'image/webp':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP'
    case 'image/heic':
    case 'video/mp4':
    case 'video/quicktime':
      return ascii(bytes, 4, 4) === 'ftyp'
    case 'video/webm':
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])
    case 'application/pdf':
      return ascii(bytes, 0, 5) === '%PDF-'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
    case 'text/plain':

    case 'text/csv': {
      const sample = bytes.slice(0, 4096)

      return !sample.some(byte => byte === 0)
    }

    default:
      return false
  }
}

export type ScanResult = { status: 'clean' | 'blocked' | 'not_scanned'; provider: string; detail: string | null }

export interface AttachmentScanner {
  readonly name: string
  scan(bytes: Uint8Array, mime: string): Promise<ScanResult>
}

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

// Built-in signature scanner: blocks executables, scripts disguised as documents and the
// EICAR test signature. Replace with a ClamAV/ICAP adapter by implementing AttachmentScanner.
export class SignatureAttachmentScanner implements AttachmentScanner {
  readonly name = 'forge_signature_v1'

  async scan(bytes: Uint8Array, mime: string): Promise<ScanResult> {
    const head = ascii(bytes, 0, Math.min(bytes.length, 8192))

    if (head.includes(EICAR)) return { status: 'blocked', provider: this.name, detail: 'EICAR test signature detected.' }
    if (startsWith(bytes, [0x4d, 0x5a])) return { status: 'blocked', provider: this.name, detail: 'Windows executable content.' }
    if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return { status: 'blocked', provider: this.name, detail: 'ELF executable content.' }
    if (startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf]))
      return { status: 'blocked', provider: this.name, detail: 'Mach-O executable content.' }
    if ((mime === 'text/plain' || mime === 'text/csv') && /^#!|<script[\s>]/i.test(head.trimStart().slice(0, 200)))
      return { status: 'blocked', provider: this.name, detail: 'Script content is not allowed.' }
    if (mime === 'application/pdf' && /\/JavaScript|\/Launch/.test(ascii(bytes, 0, Math.min(bytes.length, 262144))))
      return { status: 'blocked', provider: this.name, detail: 'PDF contains active content.' }

    return { status: 'clean', provider: this.name, detail: null }
  }
}

export const getAttachmentScanner = (): AttachmentScanner => new SignatureAttachmentScanner()

export type ValidatedAttachment = {
  bytes: Uint8Array
  mime: string
  fileName: string
  originalFileName: string
  size: number
  sha256: string
  scan: ScanResult
}

export const sanitizeFileName = (name: string) =>
  (name.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim() || 'attachment').slice(0, 200)

export const validateAttachment = async (
  file: File,
  limits: { attachmentMaxMb: number; videoMaxMb: number }
): Promise<{ ok: true; value: ValidatedAttachment } | { ok: false; error: string }> => {
  const mime = (file.type || '').toLowerCase()

  if (!HELPDESK_ALLOWED_TYPES.includes(mime)) {
    return { ok: false, error: 'Attach an image, short video, PDF, text, CSV, Word or Excel file.' }
  }

  const maxMb = VIDEO_TYPES.includes(mime) ? limits.videoMaxMb : limits.attachmentMaxMb

  if (file.size < 1 || file.size > maxMb * 1024 * 1024) {
    return { ok: false, error: `Files of this type must be under ${maxMb} MB.` }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  if (!contentMatchesType(bytes, mime)) {
    return { ok: false, error: 'The file contents do not match its type.' }
  }

  const scan = await getAttachmentScanner().scan(bytes, mime)

  if (scan.status === 'blocked') {
    return { ok: false, error: 'This file was blocked by the security scan.' }
  }

  return {
    ok: true,
    value: {
      bytes,
      mime,
      fileName: sanitizeFileName(file.name),
      originalFileName: (file.name || 'attachment').slice(0, 255),
      size: file.size,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      scan
    }
  }
}
