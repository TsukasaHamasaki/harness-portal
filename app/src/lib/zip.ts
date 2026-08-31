export type ZipEntry = { name: string; content: string };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(modifiedAt: Date): { dosTime: number; dosDate: number } {
  const hours = modifiedAt.getHours();
  const minutes = modifiedAt.getMinutes();
  const seconds = modifiedAt.getSeconds();
  const year = Math.max(0, modifiedAt.getFullYear() - 1980);
  const month = modifiedAt.getMonth();
  const day = modifiedAt.getDate();

  const dosTime = (hours << 11) | (minutes << 5) | Math.floor(seconds / 2);
  const dosDate = (year << 9) | ((month + 1) << 5) | day;

  return { dosTime, dosDate };
}

class ByteWriter {
  private chunks: number[] = [];

  writeUint16(value: number): void {
    this.chunks.push(value & 0xff, (value >>> 8) & 0xff);
  }

  writeUint32(value: number): void {
    this.chunks.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    );
  }

  writeBytes(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) {
      this.chunks.push(bytes[i]);
    }
  }

  get length(): number {
    return this.chunks.length;
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

/** 無圧縮(store)ZIPのバイト列を返す。同じ入力なら常に同じ出力（決定的）。 */
export function buildZip(entries: ZipEntry[], modifiedAt: Date): Uint8Array {
  const encoder = new TextEncoder();
  const { dosTime, dosDate } = dosDateTime(modifiedAt);

  const localSection = new ByteWriter();
  const centralSection = new ByteWriter();

  const offsets: number[] = [];
  const nameBytesList: Uint8Array[] = [];
  const dataBytesList: Uint8Array[] = [];
  const crcList: number[] = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = encoder.encode(entry.content);
    const crc = crc32(dataBytes);

    offsets.push(localSection.length);
    nameBytesList.push(nameBytes);
    dataBytesList.push(dataBytes);
    crcList.push(crc);

    localSection.writeUint32(0x04034b50);
    localSection.writeUint16(20);
    localSection.writeUint16(0x0800);
    localSection.writeUint16(0);
    localSection.writeUint16(dosTime);
    localSection.writeUint16(dosDate);
    localSection.writeUint32(crc);
    localSection.writeUint32(dataBytes.length);
    localSection.writeUint32(dataBytes.length);
    localSection.writeUint16(nameBytes.length);
    localSection.writeUint16(0);
    localSection.writeBytes(nameBytes);
    localSection.writeBytes(dataBytes);
  }

  for (let i = 0; i < entries.length; i++) {
    const nameBytes = nameBytesList[i];
    const dataBytes = dataBytesList[i];
    const crc = crcList[i];
    const offset = offsets[i];

    centralSection.writeUint32(0x02014b50);
    centralSection.writeUint16(20);
    centralSection.writeUint16(20);
    centralSection.writeUint16(0x0800);
    centralSection.writeUint16(0);
    centralSection.writeUint16(dosTime);
    centralSection.writeUint16(dosDate);
    centralSection.writeUint32(crc);
    centralSection.writeUint32(dataBytes.length);
    centralSection.writeUint32(dataBytes.length);
    centralSection.writeUint16(nameBytes.length);
    centralSection.writeUint16(0);
    centralSection.writeUint16(0);
    centralSection.writeUint16(0);
    centralSection.writeUint16(0);
    centralSection.writeUint32(0);
    centralSection.writeUint32(offset);
    centralSection.writeBytes(nameBytes);
  }

  const eocd = new ByteWriter();
  eocd.writeUint32(0x06054b50);
  eocd.writeUint16(0);
  eocd.writeUint16(0);
  eocd.writeUint16(entries.length);
  eocd.writeUint16(entries.length);
  eocd.writeUint32(centralSection.length);
  eocd.writeUint32(localSection.length);
  eocd.writeUint16(0);

  const localBytes = localSection.toBytes();
  const centralBytes = centralSection.toBytes();
  const eocdBytes = eocd.toBytes();

  const result = new Uint8Array(localBytes.length + centralBytes.length + eocdBytes.length);
  result.set(localBytes, 0);
  result.set(centralBytes, localBytes.length);
  result.set(eocdBytes, localBytes.length + centralBytes.length);

  return result;
}
