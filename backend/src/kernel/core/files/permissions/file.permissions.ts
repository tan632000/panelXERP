/**
 * Kernel file permissions.
 *
 * Upload and signed-URL access used to be guarded by the sales RFQ scopes, which made a
 * kernel route depend on one plugin's permission constants and locked every other module out
 * of file storage. These scopes are feature-neutral: any module that needs to attach a file
 * asks for them, and the kernel imports nothing from a plugin.
 */
export const FILE_READ = 'file:read' as const;
export const FILE_WRITE = 'file:write' as const;

export const filePermissions = [FILE_READ, FILE_WRITE] as const;
