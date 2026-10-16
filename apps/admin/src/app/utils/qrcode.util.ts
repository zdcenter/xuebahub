/**
 * Pure TypeScript / Zero-Dependency QR Code Generator
 * Based on Kazuhiko Arase's QR Code specification (MIT License)
 * Generates QR code matrix and draws directly to HTML5 Canvas
 */

// Error Correction Levels: L (7%), M (15%), Q (25%), H (30%)
export type QRErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

const QR_EC_LEVEL_VAL: Record<QRErrorCorrectionLevel, number> = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2
};

const QR_MAX_LENGTH: Record<QRErrorCorrectionLevel, number[]> = {
  L: [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271],
  M: [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213],
  Q: [0, 11, 20, 32, 46, 60, 74, 86, 108, 130, 151],
  H: [0, 7, 14, 24, 34, 44, 58, 64, 84, 98, 119]
};

// RS Block definitions for Version 1..10
const RS_BLOCK_TABLE: number[][][] = [
  // [totalWords, ecWords]
  // V1
  [[1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9]],
  // V2
  [[1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16]],
  // V3
  [[1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13]],
  // V4
  [[1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9]],
  // V5
  [[1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12]],
  // V6
  [[2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15]],
  // V7
  [[2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14]],
  // V8
  [[2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15]],
  // V9
  [[2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13]],
  // V10
  [[2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16]]
];

const QR_POLYNOMIAL_EXP: number[] = new Array(256);
const QR_POLYNOMIAL_LOG: number[] = new Array(256);
for (let i = 0; i < 8; i++) {
  QR_POLYNOMIAL_EXP[i] = 1 << i;
}
for (let i = 8; i < 256; i++) {
  QR_POLYNOMIAL_EXP[i] = QR_POLYNOMIAL_EXP[i - 4] ^ QR_POLYNOMIAL_EXP[i - 5] ^ QR_POLYNOMIAL_EXP[i - 6] ^ QR_POLYNOMIAL_EXP[i - 8];
}
for (let i = 0; i < 255; i++) {
  QR_POLYNOMIAL_LOG[QR_POLYNOMIAL_EXP[i]] = i;
}

function glog(n: number) {
  if (n < 1) throw new Error('glog(' + n + ')');
  return QR_POLYNOMIAL_LOG[n];
}
function gexp(n: number) {
  while (n < 0) n += 255;
  while (n >= 255) n -= 255;
  return QR_POLYNOMIAL_EXP[n];
}

class QRPolynomial {
  num: number[];
  constructor(num: number[], shift = 0) {
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (let i = 0; i < num.length - offset; i++) {
      this.num[i] = num[i + offset];
    }
    for (let i = num.length - offset; i < this.num.length; i++) {
      this.num[i] = 0;
    }
  }
  multiply(e: QRPolynomial): QRPolynomial {
    const num = new Array(this.num.length + e.num.length - 1).fill(0);
    for (let i = 0; i < this.num.length; i++) {
      for (let j = 0; j < e.num.length; j++) {
        num[i + j] ^= gexp(glog(this.num[i]) + glog(e.num[j]));
      }
    }
    return new QRPolynomial(num);
  }
  mod(e: QRPolynomial): QRPolynomial {
    if (this.num.length - e.num.length < 0) return this;
    const ratio = glog(this.num[0]) - glog(e.num[0]);
    const num = new Array(this.num.length);
    for (let i = 0; i < this.num.length; i++) num[i] = this.num[i];
    for (let i = 0; i < e.num.length; i++) {
      num[i] ^= gexp(glog(e.num[i]) + ratio);
    }
    return new QRPolynomial(num).mod(e);
  }
}

class QRBitBuffer {
  buffer: number[] = [];
  length = 0;
  put(num: number, length: number) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }
  putBit(bit: boolean) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
    }
    this.length++;
  }
}

export class QRCodeModel {
  typeNumber: number;
  errorCorrectLevel: number;
  modules: boolean[][] = [];
  moduleCount = 0;
  dataList: string[] = [];

  constructor(typeNumber: number, errorCorrectLevel: QRErrorCorrectionLevel) {
    this.typeNumber = typeNumber;
    this.errorCorrectLevel = QR_EC_LEVEL_VAL[errorCorrectLevel];
  }

  addData(data: string) {
    this.dataList.push(data);
  }

  isDark(row: number, col: number): boolean {
    if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
      return false;
    }
    return this.modules[row][col];
  }

  make() {
    this.makeImpl(false, this.getBestMaskPattern());
  }

  private makeImpl(test: boolean, maskPattern: number) {
    this.moduleCount = this.typeNumber * 4 + 17;
    this.modules = new Array(this.moduleCount);
    for (let row = 0; row < this.moduleCount; row++) {
      this.modules[row] = new Array(this.moduleCount).fill(false);
    }

    this.setupPositionProbePattern(0, 0);
    this.setupPositionProbePattern(this.moduleCount - 7, 0);
    this.setupPositionProbePattern(0, this.moduleCount - 7);
    this.setupPositionAdjustPattern();
    this.setupTimingPattern();
    this.setupTypeInfo(test, maskPattern);

    if (this.typeNumber >= 7) {
      this.setupTypeNumber(test);
    }

    const data = this.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
    this.mapData(data, maskPattern);
  }

  private setupPositionProbePattern(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) continue;
        if (
          (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
          (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
          (2 <= r && r <= 4 && 2 <= c && c <= 4)
        ) {
          this.modules[row + r][col + c] = true;
        } else {
          this.modules[row + r][col + c] = false;
        }
      }
    }
  }

  private setupTimingPattern() {
    for (let r = 8; r < this.moduleCount - 8; r++) {
      if (this.modules[r][6] !== false) continue;
      this.modules[r][6] = r % 2 === 0;
    }
    for (let c = 8; c < this.moduleCount - 8; c++) {
      if (this.modules[6][c] !== false) continue;
      this.modules[6][c] = c % 2 === 0;
    }
  }

  private setupPositionAdjustPattern() {
    const pos = this.getPatternPosition(this.typeNumber);
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const row = pos[i];
        const col = pos[j];
        if (this.modules[row][col]) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) {
              this.modules[row + r][col + c] = true;
            } else {
              this.modules[row + r][col + c] = false;
            }
          }
        }
      }
    }
  }

  private getPatternPosition(typeNumber: number): number[] {
    if (typeNumber === 1) return [];
    if (typeNumber === 2) return [6, 18];
    if (typeNumber === 3) return [6, 22];
    if (typeNumber === 4) return [6, 26];
    if (typeNumber === 5) return [6, 30];
    if (typeNumber === 6) return [6, 34];
    if (typeNumber === 7) return [6, 22, 38];
    if (typeNumber === 8) return [6, 24, 42];
    if (typeNumber === 9) return [6, 26, 46];
    if (typeNumber === 10) return [6, 28, 50];
    return [6, 26];
  }

  private setupTypeInfo(test: boolean, maskPattern: number) {
    const data = (this.errorCorrectLevel << 3) | maskPattern;
    const bits = this.getBCHTypeInfo(data);
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      if (i < 6) this.modules[i][8] = mod;
      else if (i < 8) this.modules[i + 1][8] = mod;
      else this.modules[this.moduleCount - 15 + i][8] = mod;

      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
      else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
      else this.modules[8][15 - i - 1] = mod;
    }
    this.modules[this.moduleCount - 8][8] = !test;
  }

  private setupTypeNumber(test: boolean) {
    const bits = this.getBCHTypeNumber(this.typeNumber);
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      this.modules[Math.floor(i / 3)][(i % 3) + this.moduleCount - 8 - 3] = mod;
      this.modules[(i % 3) + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
    }
  }

  private getBCHTypeInfo(data: number): number {
    let d = data << 10;
    while (this.getBCHDigit(d) - this.getBCHDigit(0x537) >= 0) {
      d ^= 0x537 << (this.getBCHDigit(d) - this.getBCHDigit(0x537));
    }
    return ((data << 10) | d) ^ 0x5412;
  }

  private getBCHTypeNumber(data: number): number {
    let d = data << 12;
    while (this.getBCHDigit(d) - this.getBCHDigit(0x1f25) >= 0) {
      d ^= 0x1f25 << (this.getBCHDigit(d) - this.getBCHDigit(0x1f25));
    }
    return (data << 12) | d;
  }

  private getBCHDigit(data: number): number {
    let digit = 0;
    while (data !== 0) {
      digit++;
      data >>>= 1;
    }
    return digit;
  }

  private getMask(maskPattern: number, i: number, j: number): boolean {
    switch (maskPattern) {
      case 0: return (i + j) % 2 === 0;
      case 1: return i % 2 === 0;
      case 2: return j % 3 === 0;
      case 3: return (i + j) % 3 === 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
      case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
      case 7: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
      default: return false;
    }
  }

  private getBestMaskPattern(): number {
    let minLostPoint = 0;
    let pattern = 0;
    for (let i = 0; i < 8; i++) {
      this.makeImpl(true, i);
      const lostPoint = this.getLostPoint();
      if (i === 0 || minLostPoint > lostPoint) {
        minLostPoint = lostPoint;
        pattern = i;
      }
    }
    return pattern;
  }

  private getLostPoint(): number {
    const moduleCount = this.moduleCount;
    let lostPoint = 0;
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        let sameCount = 0;
        const dark = this.modules[row][col];
        for (let r = -1; r <= 1; r++) {
          if (row + r < 0 || moduleCount <= row + r) continue;
          for (let c = -1; c <= 1; c++) {
            if (col + c < 0 || moduleCount <= col + c) continue;
            if (r === 0 && c === 0) continue;
            if (dark === this.modules[row + r][col + c]) sameCount++;
          }
        }
        if (sameCount > 5) lostPoint += 3 + sameCount - 5;
      }
    }
    return lostPoint;
  }

  private createData(typeNumber: number, errorCorrectLevel: number, dataList: string[]): number[] {
    const rsBlocks = RS_BLOCK_TABLE[typeNumber - 1][errorCorrectLevel];
    const buffer = new QRBitBuffer();

    for (const text of dataList) {
      buffer.put(4, 4); // 8-bit byte mode
      const bytes = new TextEncoder().encode(text);
      buffer.put(bytes.length, typeNumber < 10 ? 8 : 16);
      for (let i = 0; i < bytes.length; i++) {
        buffer.put(bytes[i], 8);
      }
    }

    let totalDataCount = 0;
    for (let i = 0; i < rsBlocks.length; i += 3) {
      totalDataCount += rsBlocks[i] * rsBlocks[i + 2];
    }

    if (buffer.length + 4 <= totalDataCount * 8) {
      buffer.put(0, 4);
    }
    while (buffer.length % 8 !== 0) {
      buffer.putBit(false);
    }
    while (true) {
      if (buffer.length >= totalDataCount * 8) break;
      buffer.put(0xec, 8);
      if (buffer.length >= totalDataCount * 8) break;
      buffer.put(0x11, 8);
    }

    return this.createBytes(buffer, rsBlocks);
  }

  private createBytes(buffer: QRBitBuffer, rsBlocks: number[]): number[] {
    let offset = 0;
    let maxDcCount = 0;
    let maxEcCount = 0;
    const dcdata: number[][] = [];
    const ecdata: number[][] = [];

    for (let r = 0; r < rsBlocks.length; r += 3) {
      const count = rsBlocks[r];
      const totalCount = rsBlocks[r + 1];
      const dataCount = rsBlocks[r + 2];

      for (let i = 0; i < count; i++) {
        dcdata.push([]);
        ecdata.push([]);
        const dc = dcdata[dcdata.length - 1];
        const ec = ecdata[ecdata.length - 1];

        for (let j = 0; j < dataCount; j++) {
          dc.push(0xff & buffer.buffer[offset + j]);
        }
        offset += dataCount;

        const rsPoly = this.getErrorCorrectPolynomial(totalCount - dataCount);
        const rawPoly = new QRPolynomial(dc, rsPoly.num.length - 1);
        const modPoly = rawPoly.mod(rsPoly);

        for (let j = 0; j < rsPoly.num.length - 1; j++) {
          const modIndex = j + modPoly.num.length - (rsPoly.num.length - 1);
          ec.push(modIndex >= 0 ? modPoly.num[modIndex] : 0);
        }

        if (maxDcCount < dc.length) maxDcCount = dc.length;
        if (maxEcCount < ec.length) maxEcCount = ec.length;
      }
    }

    const data: number[] = [];
    for (let i = 0; i < maxDcCount; i++) {
      for (let r = 0; r < dcdata.length; r++) {
        if (i < dcdata[r].length) data.push(dcdata[r][i]);
      }
    }
    for (let i = 0; i < maxEcCount; i++) {
      for (let r = 0; r < ecdata.length; r++) {
        if (i < ecdata[r].length) data.push(ecdata[r][i]);
      }
    }
    return data;
  }

  private getErrorCorrectPolynomial(errorCorrectLength: number): QRPolynomial {
    let a = new QRPolynomial([1], 0);
    for (let i = 0; i < errorCorrectLength; i++) {
      a = a.multiply(new QRPolynomial([1, gexp(i)], 0));
    }
    return a;
  }

  private mapData(data: number[], maskPattern: number) {
    let inc = -1;
    let row = this.moduleCount - 1;
    let bitIndex = 7;
    let byteIndex = 0;

    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (this.modules[row][col - c] === false) {
            let dark = false;
            if (byteIndex < data.length) {
              dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
            }
            const mask = this.getMask(maskPattern, row, col - c);
            if (mask) dark = !dark;
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }
}

/**
 * 自动计算适合文本长度的最佳 Version (1..10)
 */
export function getAutoQRCode(text: string, level: QRErrorCorrectionLevel = 'M'): QRCodeModel {
  const byteLen = new TextEncoder().encode(text).length;
  const maxTable = QR_MAX_LENGTH[level];
  let version = 1;
  for (let v = 1; v <= 10; v++) {
    if (byteLen <= maxTable[v]) {
      version = v;
      break;
    }
    version = v;
  }

  const qr = new QRCodeModel(version, level);
  qr.addData(text);
  qr.make();
  return qr;
}

/**
 * 将二维码高精绘制在 Canvas 上
 */
export function drawQRCodeToCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  options?: {
    darkColor?: string;
    lightColor?: string;
    margin?: number;
    borderRadius?: number;
  }
) {
  const darkColor = options?.darkColor || '#0f172a';
  const lightColor = options?.lightColor || '#ffffff';
  const margin = options?.margin ?? 8;
  const qr = getAutoQRCode(text, 'M');
  const count = qr.moduleCount;

  // 1. 背景底色
  ctx.save();
  ctx.fillStyle = lightColor;
  if (options?.borderRadius && options.borderRadius > 0) {
    const r = options.borderRadius;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + size, y, x + size, y + size, r);
    ctx.arcTo(x + size, y + size, x, y + size, r);
    ctx.arcTo(x, y + size, x, y, r);
    ctx.arcTo(x, y, x + size, y, r);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(x, y, size, size);
  }

  // 2. 模块网格绘制
  const innerSize = size - margin * 2;
  const moduleSize = innerSize / count;
  ctx.fillStyle = darkColor;

  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        const mx = x + margin + c * moduleSize;
        const my = y + margin + r * moduleSize;
        ctx.fillRect(Math.floor(mx), Math.floor(my), Math.ceil(moduleSize), Math.ceil(moduleSize));
      }
    }
  }
  ctx.restore();
}
