import type { IncomingMessage, ServerResponse } from 'node:http';
import { analyzeFoodImageWithGemini, GeminiServiceError } from '../_lib/gemini';

type VercelRequest = IncomingMessage & {
  method?: string;
  body?: Record<string, unknown>;
};

type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    if (!imageBase64.trim()) {
      return res.status(400).json({ error: 'Food photograph is required.' });
    }

    const result = await analyzeFoodImageWithGemini({
      imageBase64,
      mimeType: typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg',
      extraContext: typeof body.extraContext === 'string' ? body.extraContext : undefined,
      isHomemade: Boolean(body.isHomemade),
    });

    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof GeminiServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    const message = (err as Error).message || 'Failed to analyze food photograph.';
    const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
    return res.status(status).json({ error: message });
  }
}
