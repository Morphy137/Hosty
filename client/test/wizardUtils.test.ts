import { describe, it, expect } from 'vitest';
import { checkJava, requiredJavaMajor } from '../src/utils/javaRequirement';
import { parseMotd, stripMotdCodes } from '../src/utils/motd';

// Same data as the Minecraft pack's `installer.javaRequirements`.
const requirements = {
  default: 21,
  versions: [
    { from: '1.0', java: 8 },
    { from: '1.17', java: 16 },
    { from: '1.18', java: 17 },
    { from: '1.20.5', java: 21 }
  ]
};

describe('requiredJavaMajor', () => {
  it('picks the last declared requirement the version reaches', () => {
    expect(requiredJavaMajor(requirements, '1.12.2')).toBe(8);
    expect(requiredJavaMajor(requirements, '1.16.5')).toBe(8);
    expect(requiredJavaMajor(requirements, '1.17.1')).toBe(16);
    expect(requiredJavaMajor(requirements, '1.18.2')).toBe(17);
    expect(requiredJavaMajor(requirements, '1.20.4')).toBe(17);
    expect(requiredJavaMajor(requirements, '1.20.5')).toBe(21);
    expect(requiredJavaMajor(requirements, '26.1.2')).toBe(21);
    expect(requiredJavaMajor(requirements, null)).toBe(21);
    expect(requiredJavaMajor(undefined, '1.21')).toBeNull();
  });
});

describe('checkJava', () => {
  it('classifies the detected runtime', () => {
    expect(checkJava(undefined, requirements, '1.21.1')).toEqual({ status: 'unknown' });
    expect(checkJava(17, undefined, '1.21.1')).toEqual({ status: 'unknown' });
    expect(checkJava(null, requirements, '1.21.1')).toEqual({ status: 'missing', required: 21 });
    expect(checkJava(17, requirements, '1.21.1')).toEqual({ status: 'outdated', required: 21, installed: 17 });
    expect(checkJava(21, requirements, '1.20.1')).toEqual({ status: 'ok', required: 17, installed: 21 });
  });
});

describe('parseMotd', () => {
  it('splits colour and format codes into styled segments', () => {
    const segments = parseMotd('§aHello §c§lWorld&r!');
    expect(segments.map((s) => s.text)).toEqual(['Hello ', 'World', '!']);
    expect(segments[0].color).toBe('rgb(85,255,85)');
    expect(segments[1].color).toBe('rgb(255,85,85)');
    expect(segments[1].bold).toBe(true);
    expect(segments[2].color).toBeUndefined();
    expect(segments[2].bold).toBe(false);
  });

  it('strips codes for plain-text uses', () => {
    expect(stripMotdCodes('§6Gold &lBold')).toBe('Gold Bold');
  });
});
