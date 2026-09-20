-- drizzle-kit:custom
-- Preserve outstanding links while switching verification.storeIdentifier to
-- Better Auth's native "hashed" option. Both formats hash the complete original
-- identifier with SHA-256; only the stored digest encoding changes.
-- Pause auth writes during migration/deployment, as with the preceding cutover.
UPDATE verification
SET identifier = translate(
  rtrim(encode(decode(substring(identifier FROM length('reset-password-sha256:') + 1), 'hex'), 'base64'), '='),
  '+/', '-_'
)
WHERE identifier ~ '^reset-password-sha256:[0-9a-f]{64}$';
