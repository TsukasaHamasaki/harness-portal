import { describe, it, expect } from "vitest";
import { buildZip } from "./zip";

const FIXED_DATE = new Date(2026, 7, 19, 12, 34, 56);

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

describe("buildZip", () => {
  it("EOCDシグネチャで終わり、エントリ数が一致する", () => {
    const entries = [
      { name: "a.md", content: "hello" },
      { name: "b.md", content: "world" },
    ];
    const bytes = buildZip(entries, FIXED_DATE);

    const eocdOffset = bytes.length - 22;
    expect(readUint32(bytes, eocdOffset)).toBe(0x06054b50);
    expect(readUint16(bytes, eocdOffset + 8)).toBe(entries.length);
    expect(readUint16(bytes, eocdOffset + 10)).toBe(entries.length);
  });

  it("各エントリがローカルファイルヘッダのシグネチャで始まる", () => {
    const entries = [
      { name: "a.md", content: "hello" },
      { name: "b.md", content: "world" },
    ];
    const bytes = buildZip(entries, FIXED_DATE);

    expect(readUint32(bytes, 0)).toBe(0x04034b50);

    const nameLenA = readUint16(bytes, 26);
    const sizeA = readUint32(bytes, 22);
    const secondLocalOffset = 30 + nameLenA + sizeA;
    expect(readUint32(bytes, secondLocalOffset)).toBe(0x04034b50);
  });

  it("store形式（compression method が 0）で、圧縮前後のサイズが等しい", () => {
    const bytes = buildZip([{ name: "a.md", content: "hello world" }], FIXED_DATE);

    const compressionMethod = readUint16(bytes, 8);
    expect(compressionMethod).toBe(0);

    const compressedSize = readUint32(bytes, 18);
    const uncompressedSize = readUint32(bytes, 22);
    expect(compressedSize).toBe(uncompressedSize);
  });

  it("UTF-8フラグ（0x0800）が立っている", () => {
    const bytes = buildZip([{ name: "a.md", content: "hello" }], FIXED_DATE);
    const flag = readUint16(bytes, 6);
    expect(flag).toBe(0x0800);
  });

  it("CRC32が既知の値と一致する", () => {
    const bytes = buildZip([{ name: "a.txt", content: "123456789" }], FIXED_DATE);
    const crc = readUint32(bytes, 14);
    expect(crc).toBe(0xcbf43926);
  });

  it("空配列なら22バイトの空ZIPを返す", () => {
    const bytes = buildZip([], FIXED_DATE);
    expect(bytes.length).toBe(22);
    expect(readUint32(bytes, 0)).toBe(0x06054b50);
    expect(readUint16(bytes, 8)).toBe(0);
    expect(readUint16(bytes, 10)).toBe(0);
  });

  it("同じ入力と同じ日時なら毎回同じバイト列を返す", () => {
    const entries = [
      { name: "a.md", content: "hello" },
      { name: "b.md", content: "日本語の内容" },
    ];
    const bytes1 = buildZip(entries, FIXED_DATE);
    const bytes2 = buildZip(entries, FIXED_DATE);
    expect(Array.from(bytes1)).toEqual(Array.from(bytes2));
  });

  it("日本語の内容がUTF-8バイト列として格納される", () => {
    const content = "こんにちは";
    const bytes = buildZip([{ name: "a.md", content }], FIXED_DATE);

    const uncompressedSize = readUint32(bytes, 22);
    const expectedByteLength = new TextEncoder().encode(content).length;

    expect(uncompressedSize).toBe(expectedByteLength);
    expect(uncompressedSize).not.toBe(content.length);
  });
});
