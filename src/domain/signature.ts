import { createPublicKey, createVerify, verify as verifyOneShot } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { canonicalPayload } from './canonical.js';
import { isNonEmptyString, isRecord, type BundleSignature } from './types.js';

export type SignatureStatus =
  /** Signature present and cryptographically verified. */
  | 'valid'
  /** Signature present and verification failed. */
  | 'invalid'
  /** Signature metadata present, but no verification key was available. */
  | 'unverified'
  /** No signature metadata in the document. */
  | 'absent';

export interface SignatureInspection {
  status: SignatureStatus;
  algorithm?: string;
  keyId?: string;
  reason?: string;
}

const SPKI_ED25519_HEADER = Buffer.from('302a300506032b6570032100', 'hex');

/** Accepts a PEM public key or a base64-encoded raw 32-byte Ed25519 key. */
export const parsePublicKey = (raw: string): KeyObject => {
  const trimmed = raw.trim();
  if (trimmed.startsWith('-----')) {
    return createPublicKey(trimmed);
  }

  const keyBytes = Buffer.from(trimmed, 'base64');
  if (keyBytes.length !== 32) {
    throw new Error(
      'Public key must be PEM encoded or a base64-encoded raw 32-byte Ed25519 key '
        + `(received ${keyBytes.length} bytes).`,
    );
  }
  return createPublicKey({
    key: Buffer.concat([SPKI_ED25519_HEADER, keyBytes]),
    format: 'der',
    type: 'spki',
  });
};

export const readSignatureMetadata = (document: unknown): BundleSignature | null => {
  if (!isRecord(document)) {
    return null;
  }
  const {signature} = document;
  if (!isRecord(signature)) {
    return null;
  }
  const {algorithm} = signature;
  const {keyId} = signature;
  const {value} = signature;
  if (!isNonEmptyString(algorithm) || !isNonEmptyString(keyId) || !isNonEmptyString(value)) {
    return null;
  }
  return { algorithm, keyId, value };
};

export interface VerifySignatureInput {
  bundle: unknown;
  /** PEM or raw base64 public key. When absent the signature stays unverified. */
  publicKey?: string | undefined;
  /**
   * Builds the bytes the signature covers. Defaults to the runtime bundle
   * projection; the toolkit passes `canonicalDocument` to verify licences, which
   * keep every field inside the signature (see `canonical.ts`).
   */
  canonicalise?: (document: unknown) => Buffer;
}

/**
 * Verifies a signature over the canonical bytes of a document.
 *
 * Supported algorithms match what Govplane produces:
 *   - `ECDSA_SHA_256` — base64 DER signature (KMS P-256 keys)
 *   - `Ed25519`       — base64 raw signature
 */
export const inspectSignature = (input: VerifySignatureInput): SignatureInspection => {
  const metadata = readSignatureMetadata(input.bundle);

  if (!metadata) {
    const hasPartialMetadata = isRecord(input.bundle) && input.bundle.signature !== undefined;
    if (hasPartialMetadata) {
      return {
        status: 'invalid',
        reason: 'Signature metadata is incomplete: algorithm, keyId and value are required.',
      };
    }
    return { status: 'absent' };
  }

  const base: SignatureInspection = {
    status: 'unverified',
    algorithm: metadata.algorithm,
    keyId: metadata.keyId,
  };

  if (input.publicKey === undefined || input.publicKey.trim() === '') {
    return { ...base, reason: 'Public verification key is not available.' };
  }

  let key: KeyObject;
  try {
    key = parsePublicKey(input.publicKey);
  } catch (error) {
    return {
      ...base,
      reason: error instanceof Error ? error.message : 'Public key could not be parsed.',
    };
  }

  const payload = (input.canonicalise ?? canonicalPayload)(input.bundle);
  const signatureBytes = Buffer.from(metadata.value, 'base64');

  try {
    if (metadata.algorithm === 'Ed25519') {
      const valid = verifyOneShot(null, payload, key, signatureBytes);
      return { ...base, status: valid ? 'valid' : 'invalid' };
    }

    if (metadata.algorithm === 'ECDSA_SHA_256') {
      const verifier = createVerify('sha256');
      verifier.update(payload);
      verifier.end();
      const valid = verifier.verify(key, signatureBytes);
      return { ...base, status: valid ? 'valid' : 'invalid' };
    }
  } catch (error) {
    return {
      ...base,
      status: 'invalid',
      reason: error instanceof Error ? error.message : 'Signature verification failed.',
    };
  }

  return { ...base, reason: `Unsupported signature algorithm: ${metadata.algorithm}` };
};
