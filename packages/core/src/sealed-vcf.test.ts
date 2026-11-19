import { describe, expect, it } from 'vitest';
import { openVcf, sealVcf } from './sealed-vcf';

const VCF = 'BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Alice\r\nTEL;TYPE=cell:+15555550100\r\nEND:VCARD\r\n';

describe('sealed vcf', () => {
  it('round-trips, and the ciphertext does not contain the number', async () => {
    const { sealed, key } = await sealVcf(VCF);
    expect(sealed.ciphertext).not.toContain('5555550100');
    expect(await openVcf(sealed, key)).toBe(VCF);
  });

  it('fails with the wrong key', async () => {
    const { sealed } = await sealVcf(VCF);
    const other = await sealVcf(VCF);
    await expect(openVcf(sealed, other.key)).rejects.toThrow();
  });

  it('refuses oversized vCards', async () => {
    await expect(sealVcf('x'.repeat(5000))).rejects.toThrow(/over/);
  });
});
