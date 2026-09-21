/** Pack a batch of row-major vectors into transferable Float32Arrays. */

export function rowsToFloat32(rows: number[][]): Float32Array[] {
  return rows.map((row) => Float32Array.from(row));
}

/** In-place L2 normalize each row. Returns the same arrays. */
export function l2NormalizeFloat32(rows: Float32Array[]): Float32Array[] {
  for (const row of rows) {
    let n = 0;
    for (let i = 0; i < row.length; i++) n += row[i]! * row[i]!;
    const s = Math.sqrt(n) || 1;
    for (let i = 0; i < row.length; i++) row[i]! /= s;
  }
  return rows;
}

/**
 * Split a contiguous `[batch, dim]` buffer into one Float32Array per row.
 * Copies each row so buffers can be transferred independently.
 */
export function splitBatchBuffer(
  data: ArrayLike<number>,
  batch: number,
  dim: number,
): Float32Array[] {
  if (batch <= 0 || dim <= 0) return [];
  const out: Float32Array[] = [];
  for (let i = 0; i < batch; i++) {
    const row = new Float32Array(dim);
    const offset = i * dim;
    for (let j = 0; j < dim; j++) row[j] = Number(data[offset + j] ?? 0);
    out.push(row);
  }
  return out;
}

/** Collect ArrayBuffers for `postMessage(..., transfer)`. */
export function embeddingTransferList(
  vectors: { embedding: Float32Array }[],
): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  for (const v of vectors) {
    const buf = v.embedding.buffer;
    if (buf instanceof ArrayBuffer) buffers.push(buf);
  }
  return buffers;
}
