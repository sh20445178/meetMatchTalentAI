import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Use the bundled worker from pdfjs-dist
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

/**
 * Parse a PDF file and extract its text content.
 */
export function parsePdfFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const typedArray = new Uint8Array(e.target.result);
        const pdf = await getDocument({ data: typedArray }).promise;

        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item) => item.str);
          pages.push(strings.join(' '));
        }

        resolve({ text: pages.join('\n') });
      } catch (err) {
        reject(new Error('Failed to parse PDF file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
