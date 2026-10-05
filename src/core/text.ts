/**
 * UTF-8 解码（自行实现，避免依赖运行时的 TextDecoder）
 *
 * 乐谱文件绝大多数是 UTF-8；这里只处理 UTF-8（含 BOM），非法字节以 U+FFFD 代替。
 */
export function decodeUtf8(bytes: Uint8Array): string {
  let start = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    start = 3;
  }
  let out = '';
  let i = start;
  const len = bytes.length;
  while (i < len) {
    const b0 = bytes[i];
    let codePoint: number;
    let size: number;
    if (b0 < 0x80) {
      codePoint = b0;
      size = 1;
    } else if (b0 >= 0xc0 && b0 < 0xe0) {
      codePoint = b0 & 0x1f;
      size = 2;
    } else if (b0 >= 0xe0 && b0 < 0xf0) {
      codePoint = b0 & 0x0f;
      size = 3;
    } else if (b0 >= 0xf0 && b0 < 0xf8) {
      codePoint = b0 & 0x07;
      size = 4;
    } else {
      out += '\uFFFD';
      i += 1;
      continue;
    }
    if (i + size > len) {
      out += '\uFFFD';
      break;
    }
    let valid = true;
    for (let k = 1; k < size; k += 1) {
      const bk = bytes[i + k];
      if (bk < 0x80 || bk >= 0xc0) {
        valid = false;
        break;
      }
      codePoint = (codePoint << 6) | (bk & 0x3f);
    }
    if (!valid) {
      out += '\uFFFD';
      i += 1;
      continue;
    }
    out += String.fromCodePoint(codePoint);
    i += size;
  }
  return out;
}
