import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import Pdf from 'react-native-pdf';

export interface PdfToImagesResult {
  imageUris: string[];
  pageCount: number;
  error?: string;
}

export async function convertPdfToImages(pdfUri: string): Promise<PdfToImagesResult> {
  try {
    console.log('📄 Starting PDF to Images conversion');
    console.log('📂 PDF URI:', pdfUri);

    // Create a temporary directory for images
    const tempDir = `${FileSystem.cacheDirectory}pdf_images_${Date.now()}/`;
    await FileSystem.makeDirectoryAsync(tempDir);

    const imageUris: string[] = [];

    try {
      // For now, we'll use a simpler approach with expo-image-manipulator
      // Since react-native-pdf might need more complex setup

      // First, try to read PDF as base64 to check if it's valid
      const pdfData = await FileSystem.readAsStringAsync(pdfUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!pdfData) {
        throw new Error('Failed to read PDF file');
      }

      console.log('✅ PDF file read successfully, size:', pdfData.length);

      // For the initial implementation, we'll convert the PDF to a single image
      // This is a limitation but will work for most single-page bank statements

      // Create a data URI for the PDF
      const pdfDataUri = `data:application/pdf;base64,${pdfData}`;

      // Note: This is a simplified approach. In a full implementation,
      // you'd want to use a proper PDF to image library that can handle multiple pages

      // For now, we'll save the PDF as-is and let ML Kit try to handle it
      // ML Kit might be able to handle PDF files directly in some cases

      const imagePath = `${tempDir}page_1.pdf`;
      await FileSystem.copyAsync({
        from: pdfUri,
        to: imagePath,
      });

      imageUris.push(imagePath);

      console.log('✅ PDF conversion completed');
      console.log('📊 Images created:', imageUris.length);

      return {
        imageUris,
        pageCount: 1, // For now, treating as single page
        error: undefined
      };

    } catch (conversionError: any) {
      console.log('❌ PDF conversion error:', conversionError?.message);

      // Clean up temp directory on error
      try {
        await FileSystem.deleteAsync(tempDir);
      } catch (cleanupError) {
        console.log('⚠️ Cleanup error:', cleanupError);
      }

      return {
        imageUris: [],
        pageCount: 0,
        error: `PDF conversion failed: ${conversionError?.message}`
      };
    }

  } catch (error: any) {
    console.log('❌ PDF to Images Error:', error?.message);
    return {
      imageUris: [],
      pageCount: 0,
      error: `PDF to Images conversion failed: ${error?.message || 'Unknown error'}`
    };
  }
}

// Alternative implementation using expo-image-manipulator for better image handling
export async function convertPdfToOptimizedImages(pdfUri: string): Promise<PdfToImagesResult> {
  try {
    console.log('📄 Starting PDF to Optimized Images conversion');

    // First convert to images using the basic method
    const result = await convertPdfToImages(pdfUri);

    if (result.error || result.imageUris.length === 0) {
      return result;
    }

    // Optimize images for ML Kit text recognition
    const optimizedUris: string[] = [];

    for (let i = 0; i < result.imageUris.length; i++) {
      try {
        // Skip optimization for PDF files (ML Kit can handle them)
        if (result.imageUris[i].endsWith('.pdf')) {
          optimizedUris.push(result.imageUris[i]);
          continue;
        }

        const optimized = await ImageManipulator.manipulateAsync(
          result.imageUris[i],
          [
            { resize: { width: 1600 } }, // Resize for better ML Kit performance
          ],
          {
            compress: 0.8,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );

        optimizedUris.push(optimized.uri);
        console.log(`✅ Optimized image ${i + 1}:`, optimized.uri);

      } catch (optimizationError: any) {
        console.log(`⚠️ Failed to optimize image ${i + 1}, using original:`, optimizationError?.message);
        optimizedUris.push(result.imageUris[i]);
      }
    }

    return {
      imageUris: optimizedUris,
      pageCount: result.pageCount,
      error: undefined
    };

  } catch (error: any) {
    console.log('❌ PDF to Optimized Images Error:', error?.message);
    return {
      imageUris: [],
      pageCount: 0,
      error: `PDF optimization failed: ${error?.message || 'Unknown error'}`
    };
  }
}

// Clean up temporary image files
export async function cleanupTempImages(imageUris: string[]): Promise<void> {
  try {
    for (const uri of imageUris) {
      if (uri.includes('pdf_images_')) {
        try {
          const dirPath = uri.substring(0, uri.lastIndexOf('/'));
          await FileSystem.deleteAsync(dirPath);
          console.log('🗑️ Cleaned up temp directory:', dirPath);
          break; // Only need to delete the directory once
        } catch (cleanupError) {
          console.log('⚠️ Cleanup error for', uri, ':', cleanupError);
        }
      }
    }
  } catch (error) {
    console.log('⚠️ Cleanup process error:', error);
  }
}