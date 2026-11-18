const VERSION = 6
const SIZE = 21 + (VERSION - 1) * 4
const DATA_CODEWORDS = 136
const BLOCK_DATA_CODEWORDS = 68
const ECC_CODEWORDS_PER_BLOCK = 18
const REMAINDER_BITS = 7

const gfMultiply = (x: number, y: number) => {
  let z = 0
  let a = x
  let b = y

  for (let i = 0; i < 8; i += 1) {
    if ((b & 1) !== 0) z ^= a
    b >>>= 1
    a <<= 1
    if ((a & 0x100) !== 0) a ^= 0x11d
  }

  return z
}

const reedSolomonDivisor = (degree: number) => {
  const result = Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1

  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j], root)
      if (j + 1 < degree) result[j] ^= result[j + 1]
    }
    root = gfMultiply(root, 2)
  }

  return result
}

const reedSolomonRemainder = (data: number[], divisor: number[]) => {
  let result = Array<number>(divisor.length).fill(0)

  for (const byte of data) {
    const factor = byte ^ result[0]
    result = [...result.slice(1), 0]

    for (let i = 0; i < divisor.length; i += 1) {
      result[i] ^= gfMultiply(divisor[i], factor)
    }
  }

  return result
}

const appendBits = (target: number[], value: number, length: number) => {
  for (let i = length - 1; i >= 0; i -= 1) {
    target.push((value >>> i) & 1)
  }
}

const encodeCodewords = (text: string) => {
  const bytes = Array.from(new TextEncoder().encode(text))

  if (bytes.length > 134) {
    throw new Error('Forge QR scan URL is too long for the embedded QR encoder.')
  }

  const bits: number[] = []

  // Byte mode for QR versions 1-9.
  appendBits(bits, 0b0100, 4)
  appendBits(bits, bytes.length, 8)

  for (const byte of bytes) appendBits(bits, byte, 8)

  const capacityBits = DATA_CODEWORDS * 8
  const terminatorLength = Math.min(4, capacityBits - bits.length)

  for (let i = 0; i < terminatorLength; i += 1) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  const data: number[] = []

  for (let offset = 0; offset < bits.length; offset += 8) {
    let value = 0
    for (let i = 0; i < 8; i += 1) value = (value << 1) | bits[offset + i]
    data.push(value)
  }

  let padIndex = 0
  while (data.length < DATA_CODEWORDS) {
    data.push(padIndex % 2 === 0 ? 0xec : 0x11)
    padIndex += 1
  }

  const blocks = [
    data.slice(0, BLOCK_DATA_CODEWORDS),
    data.slice(BLOCK_DATA_CODEWORDS)
  ]

  const divisor = reedSolomonDivisor(ECC_CODEWORDS_PER_BLOCK)
  const eccBlocks = blocks.map(block => reedSolomonRemainder(block, divisor))
  const codewords: number[] = []

  for (let i = 0; i < BLOCK_DATA_CODEWORDS; i += 1) {
    codewords.push(blocks[0][i], blocks[1][i])
  }

  for (let i = 0; i < ECC_CODEWORDS_PER_BLOCK; i += 1) {
    codewords.push(eccBlocks[0][i], eccBlocks[1][i])
  }

  const result: number[] = []
  for (const byte of codewords) appendBits(result, byte, 8)
  for (let i = 0; i < REMAINDER_BITS; i += 1) result.push(0)

  return result
}

const buildModules = (text: string) => {
  const dataBits = encodeCodewords(text)
  const modules = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false))
  const functionModules = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false))

  const setFunctionModule = (x: number, y: number, value: boolean) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
    modules[y][x] = value
    functionModules[y][x] = true
  }

  const drawFinderPattern = (centerX: number, centerY: number) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy))
        setFunctionModule(centerX + dx, centerY + dy, distance !== 2 && distance !== 4)
      }
    }
  }

  drawFinderPattern(3, 3)
  drawFinderPattern(SIZE - 4, 3)
  drawFinderPattern(3, SIZE - 4)

  for (let i = 0; i < SIZE; i += 1) {
    if (!functionModules[6][i]) setFunctionModule(i, 6, i % 2 === 0)
    if (!functionModules[i][6]) setFunctionModule(6, i, i % 2 === 0)
  }

  // Version 6 has one non-overlapping alignment pattern centered at 34,34.
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunctionModule(34 + dx, 34 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }

  const drawFormatBits = () => {
    // Error correction level L (01), mask pattern 0.
    const data = (1 << 3) | 0
    let remainder = data

    for (let i = 0; i < 10; i += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
    }

    const bits = ((data << 10) | remainder) ^ 0x5412
    const getBit = (index: number) => ((bits >>> index) & 1) !== 0

    for (let i = 0; i <= 5; i += 1) setFunctionModule(8, i, getBit(i))
    setFunctionModule(8, 7, getBit(6))
    setFunctionModule(8, 8, getBit(7))
    setFunctionModule(7, 8, getBit(8))

    for (let i = 9; i < 15; i += 1) {
      setFunctionModule(14 - i, 8, getBit(i))
    }

    for (let i = 0; i < 8; i += 1) {
      setFunctionModule(SIZE - 1 - i, 8, getBit(i))
    }

    for (let i = 8; i < 15; i += 1) {
      setFunctionModule(8, SIZE - 15 + i, getBit(i))
    }

    setFunctionModule(8, SIZE - 8, true)
  }

  // Reserve format-information modules before placing payload bits.
  drawFormatBits()

  let bitIndex = 0
  let right = SIZE - 1
  let upward = true

  while (right >= 1) {
    if (right === 6) right -= 1

    for (let vertical = 0; vertical < SIZE; vertical += 1) {
      const y = upward ? SIZE - 1 - vertical : vertical

      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset
        if (functionModules[y][x]) continue

        let value = dataBits[bitIndex] === 1
        bitIndex += 1

        // QR mask pattern 0.
        if ((x + y) % 2 === 0) value = !value
        modules[y][x] = value
      }
    }

    upward = !upward
    right -= 2
  }

  drawFormatBits()
  return modules
}

export const generateForgeQrSvg = (value: string, moduleSize = 8) => {
  const modules = buildModules(value)
  const quietZone = 4
  const dimension = (SIZE + quietZone * 2) * moduleSize
  const rects: string[] = []

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!modules[y][x]) continue

      rects.push(
        '<rect x="' +
          String((x + quietZone) * moduleSize) +
          '" y="' +
          String((y + quietZone) * moduleSize) +
          '" width="' +
          String(moduleSize) +
          '" height="' +
          String(moduleSize) +
          '"/>'
      )
    }
  }

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
    String(dimension) +
    ' ' +
    String(dimension) +
    '" width="' +
    String(dimension) +
    '" height="' +
    String(dimension) +
    '" role="img" aria-label="Forge managed QR code">' +
    '<rect width="100%" height="100%" fill="white"/>' +
    '<g fill="black">' +
    rects.join('') +
    '</g></svg>'
  )
}
