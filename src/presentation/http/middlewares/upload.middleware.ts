/**
 * FILE UPLOAD — NOT IMPLEMENTED YET. Do NOT add multer/busboy now.
 * When uploads are introduced, this middleware MUST enforce ALL of the following:
 *
 * TODO(upload): allowlist of MIME types (e.g. image/jpeg, image/png, application/pdf) — reject others with FILE_TYPE_NOT_ALLOWED (415)
 * TODO(upload): verify REAL type via magic bytes (e.g. `file-type`), never trust Content-Type or the extension
 * TODO(upload): max size in MB per file (reject with FILE_TOO_LARGE, 413) and max file count per request
 * TODO(upload): sanitize file names; generate server-side random names (uuid); never use user-supplied paths
 * TODO(upload): store outside the web root / in object storage; never serve user files from the API origin inline
 * TODO(upload): serve downloads with Content-Disposition: attachment and X-Content-Type-Options: nosniff
 * TODO(upload): antivirus / malware scan hook before the file becomes accessible
 * TODO(upload): authenticate + authorize + rate-limit upload routes; document them in Swagger (multipart/form-data)
 * TODO(upload): reject archives / executables / SVG with scripts unless explicitly required and sanitized
 */
export const UPLOAD_LIMITS_TODO = {
  maxFileSizeMb: 5, // TODO(upload): confirm with product requirements
  allowedMimeTypes: [] as string[], // TODO(upload): fill the allowlist
} as const;
