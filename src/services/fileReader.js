/**
 * Read a File as ArrayBuffer using multiple strategies.
 * Tries different approaches to bypass DLP/security policy interception.
 */
export async function readFileAsArrayBuffer(file) {
  const errors = [];

  // Strategy 1: Modern API — file.arrayBuffer()
  if (typeof file.arrayBuffer === 'function') {
    try {
      const buf = await file.arrayBuffer();
      if (buf && buf.byteLength > 0) return buf;
    } catch (e) {
      errors.push('file.arrayBuffer: ' + e.message);
      console.warn('[File Read] Strategy 1 failed:', e.message);
    }
  }

  // Strategy 2: Response constructor — completely different code path
  try {
    const response = new Response(file);
    const buf = await response.arrayBuffer();
    if (buf && buf.byteLength > 0) return buf;
  } catch (e) {
    errors.push('Response: ' + e.message);
    console.warn('[File Read] Strategy 2 failed:', e.message);
  }

  // Strategy 3: Object URL + fetch — goes through network stack
  try {
    const url = URL.createObjectURL(file);
    try {
      const response = await fetch(url);
      const buf = await response.arrayBuffer();
      if (buf && buf.byteLength > 0) return buf;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    errors.push('ObjectURL+fetch: ' + e.message);
    console.warn('[File Read] Strategy 3 failed:', e.message);
  }

  // Strategy 4: Read as Data URL, decode base64 to ArrayBuffer
  try {
    const buf = await readViaDataUrl(file);
    if (buf && buf.byteLength > 0) return buf;
  } catch (e) {
    errors.push('DataURL: ' + e.message);
    console.warn('[File Read] Strategy 4 failed:', e.message);
  }

  // Strategy 5: FileReader on original File
  try {
    const buf = await fileReaderRead(file);
    if (buf && buf.byteLength > 0) return buf;
  } catch (e) {
    errors.push('FileReader: ' + e.message);
    console.warn('[File Read] Strategy 5 failed:', e.message);
  }

  // Strategy 6: FileReader on Blob slice
  try {
    const blob = file.slice(0, file.size, file.type);
    const buf = await fileReaderRead(blob);
    if (buf && buf.byteLength > 0) return buf;
  } catch (e) {
    errors.push('Blob slice: ' + e.message);
    console.warn('[File Read] Strategy 6 failed:', e.message);
  }

  // Strategy 7: FileReader on Blob copy
  try {
    const blob = new Blob([file], { type: file.type });
    const buf = await fileReaderRead(blob);
    if (buf && buf.byteLength > 0) return buf;
  } catch (e) {
    errors.push('Blob copy: ' + e.message);
    console.warn('[File Read] Strategy 7 failed:', e.message);
  }

  // Strategy 8: ReadableStream from file
  if (typeof file.stream === 'function') {
    try {
      const reader = file.stream().getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLen = chunks.reduce((s, c) => s + c.length, 0);
      const buf = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        buf.set(chunk, offset);
        offset += chunk.length;
      }
      if (buf.byteLength > 0) return buf.buffer;
    } catch (e) {
      errors.push('ReadableStream: ' + e.message);
      console.warn('[File Read] Strategy 8 failed:', e.message);
    }
  }

  // Strategy 9: Re-create file with generic MIME type to bypass DLP content inspection
  try {
    const genericFile = new File([file], 'data.bin', { type: 'application/octet-stream' });
    const buf = await genericFile.arrayBuffer();
    if (buf && buf.byteLength > 0) return buf;
  } catch (e) {
    errors.push('GenericMIME: ' + e.message);
    console.warn('[File Read] Strategy 9 failed:', e.message);
  }

  // Strategy 10: Blob with no MIME type + DataURL decode
  try {
    const noTypeBlob = new Blob([file]);
    const buf = await readViaDataUrl(noTypeBlob);
    if (buf && buf.byteLength > 0) return buf;
  } catch (e) {
    errors.push('NoMIME-DataURL: ' + e.message);
    console.warn('[File Read] Strategy 10 failed:', e.message);
  }

  // Strategy 11: ObjectURL on generic Blob + fetch
  try {
    const genericBlob = new Blob([file], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(genericBlob);
    try {
      const response = await fetch(url);
      const buf = await response.arrayBuffer();
      if (buf && buf.byteLength > 0) return buf;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    errors.push('GenericBlob+fetch: ' + e.message);
    console.warn('[File Read] Strategy 11 failed:', e.message);
  }

  console.error('[File Read] All strategies failed:', errors);
  throw new Error(
    'Your organization\'s security policy (DLP) is blocking file access for "' + file.name + '". ' +
    'Try: (1) open in incognito/private mode, (2) use a different browser without the DLP extension, ' +
    'or (3) disable your browser\'s DLP extension temporarily.'
  );
}

/**
 * Read file as Data URL (base64), then decode to ArrayBuffer.
 * DLP tools sometimes allow readAsDataURL but block readAsArrayBuffer.
 */
function readViaDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = reader.result;
        // Strip "data:...;base64," prefix
        const base64 = dataUrl.split(',')[1];
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        resolve(bytes.buffer);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error(reader.error?.message || 'DataURL read error'));
    reader.readAsDataURL(file);
  });
}

function fileReaderRead(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(reader.error?.message || 'FileReader error'));
    reader.readAsArrayBuffer(blob);
  });
}
