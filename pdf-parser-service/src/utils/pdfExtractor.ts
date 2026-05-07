// Dynamic import for ESM compatibility
type PDFJSLib = any;

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

export interface ExtractedPDFData {
  items: TextItem[];
  pageCount: number;
  width: number;
  height: number;
}

export class PDFExtractor {

  /**
   * Extract text items with coordinates from PDF base64 data
   */
  static async extractText(pdfBase64: string): Promise<ExtractedPDFData> {
    try {
      console.log('📄 Starting PDF text extraction...');

      // Dynamic import for ESM compatibility
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

      // Convert base64 to ArrayBuffer
      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Load PDF document
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      console.log(`📄 PDF loaded: ${pdf.numPages} pages`);

      const allItems: TextItem[] = [];
      let pageWidth = 0;
      let pageHeight = 0;

      // Process each page
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        console.log(`📄 Processing page ${pageNum}...`);

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });

        // Store page dimensions (use first page)
        if (pageNum === 1) {
          pageWidth = viewport.width;
          pageHeight = viewport.height;
        }

        // Get text content with coordinates
        const textContent = await page.getTextContent();

        // Process each text item
        for (const item of textContent.items) {
          if ('str' in item && item.str.trim()) {
            allItems.push({
              str: item.str,
              x: item.transform[4], // X coordinate
              y: item.transform[5], // Y coordinate
              width: item.width || 0,
              height: item.height || 0,
              fontName: item.fontName || '',
              hasEOL: item.hasEOL || false
            });
          }
        }
      }

      console.log(`✅ Extracted ${allItems.length} text items from ${pdf.numPages} pages`);

      return {
        items: allItems,
        pageCount: pdf.numPages,
        width: pageWidth,
        height: pageHeight
      };

    } catch (error) {
      console.error('❌ PDF extraction error:', error);
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  /**
   * Group text items by approximate Y coordinate (lines)
   */
  static groupByLines(items: TextItem[], tolerance: number = 5): TextItem[][] {
    const lines: TextItem[][] = [];
    const sortedItems = [...items].sort((a, b) => b.y - a.y); // Top to bottom

    for (const item of sortedItems) {
      // Find existing line with similar Y coordinate
      const existingLine = lines.find(line =>
        Math.abs(line[0].y - item.y) <= tolerance
      );

      if (existingLine) {
        existingLine.push(item);
      } else {
        lines.push([item]);
      }
    }

    // Sort items within each line by X coordinate (left to right)
    lines.forEach(line => line.sort((a, b) => a.x - b.x));

    return lines;
  }

  /**
   * Convert text items to plain text (for debugging)
   */
  static toPlainText(items: TextItem[]): string {
    const lines = this.groupByLines(items);
    return lines.map(line =>
      line.map(item => item.str).join(' ')
    ).join('\n');
  }
}