import { generateKeyPairSync, sign as signPayload } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { canonicalDocument, canonicalPayload } from '../../src/domain/canonical.js';
import { inspectSignature } from '../../src/domain/signature.js';
import { validBundle } from '../helpers/fixtures.js';

const licenceBody = () => ({
  schemaVersion: 1,
  licenseId: 'lic_test',
  subject: { email: 'dev@example.com' },
  plan: 'toolkit-free',
  issuedAt: '2026-07-29T12:00:00.000Z',
  terms: { version: '2026-07-01', acceptedAt: '2026-07-29T11:59:58.000Z' },
  marketingConsent: false,
});

describe('canonicalDocument', () => {
  it('keeps every field except the signature', () => {
    const signature = { algorithm: 'Ed25519', keyId: 'k', value: 'v' };
    const document = { ...licenceBody(), signature };
    const canonical = canonicalDocument(document).toString('utf8');
    const parsed = JSON.parse(canonical) as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual([
      'issuedAt', 'licenseId', 'marketingConsent', 'plan', 'schemaVersion', 'subject', 'terms',
    ]);
    expect(parsed.signature).toBeUndefined();
  });

  it('is independent of key order', () => {
    const body = licenceBody();
    const reordered = {
      marketingConsent: body.marketingConsent,
      terms: { acceptedAt: body.terms.acceptedAt, version: body.terms.version },
      subject: body.subject,
      plan: body.plan,
      issuedAt: body.issuedAt,
      licenseId: body.licenseId,
      schemaVersion: body.schemaVersion,
    };

    expect(canonicalDocument(reordered).toString('utf8'))
      .toBe(canonicalDocument(body).toString('utf8'));
  });

  it('does not drop the fields a bundle projection would discard', () => {
    // The bundle projection keeps only scope and policies; a licence must keep
    // consent and terms inside the signed bytes.
    const document = licenceBody();
    expect(canonicalDocument(document).toString('utf8')).toContain('marketingConsent');
    expect(canonicalPayload(document).toString('utf8')).not.toContain('marketingConsent');
  });

  it('tolerates documents that are not objects', () => {
    expect(canonicalDocument('nope').toString('utf8')).toBe('{}');
  });

  it('differs from the bundle projection for the same input', () => {
    const bundle = validBundle();
    expect(canonicalDocument(bundle).toString('utf8'))
      .not.toBe(canonicalPayload(bundle).toString('utf8'));
  });
});

describe('inspectSignature with a document canonicaliser', () => {
  it('verifies a licence signed over the whole document', () => {
    const body = licenceBody();
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const value = signPayload(null, canonicalDocument(body), privateKey).toString('base64');
    const licence = {
      ...body,
      signature: { algorithm: 'Ed25519', keyId: 'license-key-01', value },
    };
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    expect(inspectSignature({
      bundle: licence,
      publicKey: pem,
      canonicalise: canonicalDocument,
    }).status).toBe('valid');
  });

  it('rejects a licence whose consent flag was edited', () => {
    const body = licenceBody();
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const value = signPayload(null, canonicalDocument(body), privateKey).toString('base64');
    const tampered = {
      ...body,
      marketingConsent: true,
      signature: { algorithm: 'Ed25519', keyId: 'license-key-01', value },
    };
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    expect(inspectSignature({
      bundle: tampered,
      publicKey: pem,
      canonicalise: canonicalDocument,
    }).status).toBe('invalid');
  });
});
