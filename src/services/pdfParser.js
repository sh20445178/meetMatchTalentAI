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
        let nameHint = '';

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();

          // On page 1, find the largest font text — typically the candidate name
          if (i === 1 && content.items.length > 0) {
            // Group text items by rounded font size (transform scaleY)
            const itemsBySize = new Map();
            for (const item of content.items) {
              const fontSize = Math.round(Math.abs(item.transform[3]) * 10) / 10;
              const str = item.str.trim();
              if (!str) continue;
              if (!itemsBySize.has(fontSize)) itemsBySize.set(fontSize, []);
              itemsBySize.get(fontSize).push(str);
            }
            // Sort font sizes descending
            const sortedSizes = [...itemsBySize.keys()].sort((a, b) => b - a);
            // Try the top 3 largest font sizes for a name
            const hints = [];
            for (const size of sortedSizes.slice(0, 3)) {
              hints.push(itemsBySize.get(size).join(' ').trim());
            }
            nameHint = hints.join('\n');

            console.log('[PDF Parser] Page 1 font sizes:', sortedSizes.slice(0, 5));
            console.log('[PDF Parser] Name hints:', hints.slice(0, 3));
          }

          // Group text items by Y position to preserve line breaks
          let lastY = null;
          let lastX = 0;
          const lineChunks = [];
          for (const item of content.items) {
            const y = item.transform[5];
            const x = item.transform[4];
            if (lastY !== null && Math.abs(y - lastY) > 2) {
              lineChunks.push('\n');
            } else if (lastY !== null && x > lastX + 1 && !item.str.startsWith(' ')) {
              // Add a space between items on the same line that are spaced apart
              lineChunks.push(' ');
            }
            lineChunks.push(item.str);
            lastY = y;
            lastX = x + (item.width || 0);
          }
          pages.push(lineChunks.join(''));
        }

        resolve({ text: pages.join('\n'), nameHint });
      } catch (err) {
        reject(new Error('Failed to parse PDF file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
