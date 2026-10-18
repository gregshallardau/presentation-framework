// Tiny JSON request/response helpers for the editor's connect middleware.
// Errors use md-doc editor's shape - { detail: string | { message, ... } } -
// so the client's api() wrapper handles both editors identically.

export class HttpError extends Error {
	constructor(status, detail) {
		super(typeof detail === 'string' ? detail : detail?.message || `HTTP ${status}`);
		this.status = status;
		this.detail = detail;
	}
}

export const MAX_BODY_BYTES = 20 * 1024 * 1024;

export function readJson(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on('data', (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(new HttpError(413, 'Request body is larger than 20 MiB'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => {
			if (!chunks.length) return resolve({});
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
			} catch {
				reject(new HttpError(400, 'Request body is not valid JSON'));
			}
		});
		req.on('error', reject);
	});
}

export function sendJson(res, status, data) {
	const body = JSON.stringify(data);
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.setHeader('Cache-Control', 'no-store');
	res.end(body);
}
