import type { IncomingMessage, ServerResponse } from 'node:http';

type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

export default function handler(_req: IncomingMessage, res: VercelResponse) {
  res.status(200).json({ ok: true, mode: 'vercel-serverless' });
}
