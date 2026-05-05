import TextRecognition from '@react-native-ml-kit/text-recognition';

export interface MLKitResult {
  rawText: string;
  confidence: number;
  extraction_method: 'ml_kit_text_recognition';
  debug_text_length: number;
  debug_first_500: string;
  error?: string;
}

export async function recognizeTextFromImage(imageUri: string): Promise<MLKitResult> {
  try {
    console.log('🔍 Starting ML Kit text recognition');
    console.log('📄 Image URI:', imageUri);

    // Run ML Kit text recognition on the image
    const result = await TextRecognition.recognize(imageUri);

    const rawText = result.text || '';
    console.log('✅ ML Kit extraction complete - Text length:', rawText.length);
    console.log('📝 First 200 chars:', rawText.substring(0, 200));

    return {
      rawText,
      confidence: 0.9, // ML Kit doesn't provide confidence scores, use high default
      extraction_method: 'ml_kit_text_recognition',
      debug_text_length: rawText.length,
      debug_first_500: rawText.substring(0, 500)
    };

  } catch (error: any) {
    console.log('❌ ML Kit Error:', error?.message);
    return {
      rawText: '',
      confidence: 0,
      extraction_method: 'ml_kit_text_recognition',
      debug_text_length: 0,
      debug_first_500: '',
      error: `ML Kit text recognition failed: ${error?.message || 'Unknown error'}`
    };
  }
}

export async function recognizeTextFromMultipleImages(imageUris: string[]): Promise<MLKitResult> {
  try {
    console.log('🔍 Starting ML Kit recognition for', imageUris.length, 'images');

    const results: string[] = [];

    for (let i = 0; i < imageUris.length; i++) {
      console.log(`📄 Processing page ${i + 1}/${imageUris.length}`);

      try {
        const result = await TextRecognition.recognize(imageUris[i]);
        const pageText = result.text || '';

        if (pageText.trim()) {
          results.push(`--- Page ${i + 1} ---\n${pageText}`);
          console.log(`✅ Page ${i + 1} - Extracted ${pageText.length} chars`);
        } else {
          console.log(`⚠️ Page ${i + 1} - No text found`);
        }
      } catch (pageError: any) {
        console.log(`❌ Page ${i + 1} failed:`, pageError?.message);
        results.push(`--- Page ${i + 1} (Error) ---\nFailed to extract text: ${pageError?.message}`);
      }
    }

    const combinedText = results.join('\n\n');

    console.log('✅ ML Kit multi-page extraction complete');
    console.log('📊 Total pages processed:', imageUris.length);
    console.log('📊 Total text length:', combinedText.length);

    return {
      rawText: combinedText,
      confidence: 0.9,
      extraction_method: 'ml_kit_text_recognition',
      debug_text_length: combinedText.length,
      debug_first_500: combinedText.substring(0, 500)
    };

  } catch (error: any) {
    console.log('❌ ML Kit Multi-page Error:', error?.message);
    return {
      rawText: '',
      confidence: 0,
      extraction_method: 'ml_kit_text_recognition',
      debug_text_length: 0,
      debug_first_500: '',
      error: `ML Kit multi-page recognition failed: ${error?.message || 'Unknown error'}`
    };
  }
}