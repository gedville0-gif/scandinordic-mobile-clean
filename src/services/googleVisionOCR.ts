import * as FileSystem from 'expo-file-system/legacy';

export interface OCRResult {
  merchant?: string;
  vendor?: string;
  store?: string;
  net_amount?: number | null;
  vat_rate?: number | null;
  date?: string | null;
  category?: string;
  confidence?: number;
  error?: boolean | string;
}

export async function scanWithGoogleVision(imageUri: string, preloadedBase64?: string): Promise<OCRResult> {
  try {
    console.log('🔍 Starting OCR');

    let base64 = preloadedBase64;

    if (!base64) {
      base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    console.log('✅ Base64 ready, length:', base64?.length);

    const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/google-vision-ocr`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ image: base64 }),
    });

    const result = await response.json();
    console.log('📦 Result:', JSON.stringify(result).slice(0, 300));
    return result as OCRResult;

  } catch (error: any) {
    console.log('❌ OCR Error:', error?.message);
    return { error: true };
  }
}
