import { describe, it, expect } from 'vitest';
import { checkJava, requiredJavaMajor } from '../src/utils/javaRequirement';
import { parseMotd, stripMotdCodes } from '../src/utils/motd';

describe('requiredJavaMajor', () => {
  it('follows the Mojang requirements per Minecraft version', () => {
    expect(requiredJavaMajor('1.12.2')).toBe(8);
    expect(requiredJavaMajor('1.16.5')).toBe(8);
    expect(requiredJavaMajor('1.17.1')).toBe(16);
    expect(requiredJavaMajor('1.18.2')).toBe(17);
    expect(requiredJavaMajor('1.20.4')).toBe(17);
    expect(requiredJavaMajor('1.20.5')).toBe(21);
    expect(requiredJavaMajor('1.21.1')).toBe(21);
    expect(requiredJavaMajor('26.1.2')).toBe(21);
    expect(requiredJavaMajor(null)).toBe(21);
  });
});

describe('checkJava', () => {
  it('classifies the detected runtime', () => {
    expect(checkJava(undefined, '1.21.1')).toEqual({ status: 'unknown' });
    expect(checkJava(null, '1.21.1')).toEqual({ status: 'missing', required: 21 });
    expect(checkJava(17, '1.21.1')).toEqual({ status: 'outdated', required: 21, installed: 17 });
    expect(checkJava(21, '1.20.1')).toEqual({ status: 'ok', required: 17, installed: 21 });
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
