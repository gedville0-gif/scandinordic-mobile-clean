import * as FileSystem from 'expo-file-system/legacy';

export interface PdfToImagesResult {
  imageUris: string[];
  pageCount: number;
  error?: string;
}

export async function convertPdfToImages(pdfUri: string): Promise<PdfToImagesResult> {
  try {
    console.log('📄 Starting PDF validation for Google Vision Files API');
    console.log('📂 PDF URI:', pdfUri);

    // Validate PDF file exists and is accessible
    const fileInfo = await FileSystem.getInfoAsync(pdfUri);
    if (!fileInfo.exists) {
      throw new Error('PDF file does not exist');
    }

    console.log('✅ PDF file validated, size:', fileInfo.size, 'bytes');

    // Read PDF to validate it's accessible and get basic info
    const pdfData = await FileSystem.readAsStringAsync(pdfUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!pdfData) {
      throw new Error('Failed to read PDF file');
    }

    // Validate PDF signature
    if (!pdfData.startsWith('JVBERi0')) { // PDF signature in base64
      throw new Error('File does not appear to be a valid PDF');
    }

    console.log('✅ PDF validated successfully');
    console.log('📊 PDF data length:', pdfData.length, 'characters');

    // Return PDF URI directly - Google Vision Files API will handle it natively
    return {
      imageUris: [pdfUri], // Return original PDF path
      pageCount: 1, // Simplified - Google Vision will determine actual page count
      error: undefined
    };

  } catch (error: any) {
    console.log('❌ PDF validation error:', error?.message);
    return {
      imageUris: [],
      pageCount: 0,
      error: `PDF validation failed: ${error?.message || 'Unknown error'}`
    };
  }
}

// Simplified version - same as main function since no optimization needed
export async function convertPdfToOptimizedImages(pdfUri: string): Promise<PdfToImagesResult> {
  console.log('📄 PDF processing for Google Vision Files API (no optimization needed)');

  // Since Google Vision Files API handles PDFs natively, no optimization needed
  return convertPdfToImages(pdfUri);
}

// Clean up temporary files (simplified since we're not creating temp files)
export async function cleanupTempImages(imageUris: string[]): Promise<void> {
  try {
    console.log('🗑️ Cleanup called, but no temp files created (using native PDF processing)');
    // No cleanup needed since we're passing original PDF files directly
  } catch (error) {
    console.log('⚠️ Cleanup process error:', error);
  }
}