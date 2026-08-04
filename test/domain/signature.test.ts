import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { canonicalPayload } from '../../src/domain/canonical.js';
import {
  inspectSignature, parsePublicKey, readSignatureMetadata,
} from '../../src/domain/signature.js';
import { signedBundle, validBundle } from '../helpers/fixtures.js';

describe('readSignatureMetadata', () => {
  it('returns the metadata when it is complete', () => {
    const { bundle } = signedBundle();
    expect(readSignatureMetadata(bundle)).toMatchObject({
      algorithm: 'Ed25519',
      keyId: 'test-key-01',
    });
  });

  it('returns null when metadata is missing or incomplete', () => {
    expect(readSignatureMetadata(validBundle())).toBeNull();
    expect(readSignatureMetadata({ signature: { algorithm: 'Ed25519' } })).toBeNull();
    expect(readSignatureMetadata('nope')).toBeNull();
  });
});

describe('parsePublicKey', () => {
  it('parses PEM keys', () => {
    const { publicKeyPem } = signedBundle();
    expect(parsePublicKey(publicKeyPem).asymmetricKeyType).toBe('ed25519');
  });

  it('parses raw base64 Ed25519 keys', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
    expect(parsePublicKey(raw).asymmetricKeyType).toBe('ed25519');
  });

  it('rejects keys of the wrong length', () => {
    expect(() => parsePublicKey(Buffer.from('short').toString('base64')))
      .toThrow('base64-encoded raw 32-byte Ed25519 key');
  });
});

describe('inspectSignature', () => {
  it('reports an absent signature', () => {
    expect(inspectSignature({ bundle: validBundle() }).status).toBe('absent');
  });

  it('reports incomplete metadata as invalid', () => {
    const result = inspectSignature({ bundle: { signature: { algorithm: 'Ed25519' } } });
    expect(result.status).toBe('invalid');
  });

  it('stays unverified when no key is supplied', () => {
    const { bundle } = signedBundle();
    const result = inspectSignature({ bundle });
    expect(result.status).toBe('unverified');
    expect(result.reason).toBe('Public verification key is not available.');
  });

  it('verifies a valid Ed25519 signature', () => {
    const { bundle, publicKeyPem } = signedBundle();
    expect(inspectSignature({ bundle, publicKey: publicKeyPem }).status).toBe('valid');
  });

  it('detects a tampered bundle', () => {
    const { bundle, publicKeyPem } = signedBundle();
    const tampered = { ...bundle, policies: [] };
    expect(inspectSignature({ bundle: tampered, publicKey: publicKeyPem }).status).toBe('invalid');
  });

  it('verifies ECDSA_SHA_256 signatures produced by the control plane', () => {
    const bundle = validBundle();
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const signer = createSign('sha256');
    signer.update(canonicalPayload(bundle));
    signer.end();

    const signed = {
      ...bundle,
      signature: {
        algorithm: 'ECDSA_SHA_256',
        keyId: 'kms-key-1',
        value: signer.sign(privateKey).toString('base64'),
      },
    };

    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(inspectSignature({ bundle: signed, publicKey: pem }).status).toBe('valid');
  });

  it('reports unsupported algorithms without verifying', () => {
    const { publicKeyPem } = signedBundle();
    const result = inspectSignature({
      bundle: { ...validBundle(), signature: { algorithm: 'RSA_PSS', keyId: 'k', value: 'AA==' } },
      publicKey: publicKeyPem,
    });
    expect(result.status).toBe('unverified');
    expect(result.reason).toContain('Unsupported signature algorithm');
  });

  it('reports an unusable public key', () => {
    const { bundle } = signedBundle();
    const result = inspectSignature({ bundle, publicKey: 'not-a-key' });
    expect(result.status).toBe('unverified');
    expect(result.reason).toBeDefined();
  });
});
