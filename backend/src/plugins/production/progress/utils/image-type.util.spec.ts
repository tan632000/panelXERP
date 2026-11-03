import {
  extensionOf,
  hasImageSignature,
  imageTypeOfName,
} from '@plugins/production/progress/utils/image-type.util';
import { sanitizePhotoName } from '@plugins/production/progress/utils/photo-filename.util';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PDF = Buffer.from('%PDF-1.7');

const typeOf = (name: string) => {
  const type = imageTypeOfName(name);
  if (!type) throw new Error(`${name} is not an image name`);
  return type;
};

describe('image type', () => {
  it.each([
    ['site.png', 'png', 'image/png'],
    ['SITE.PNG', 'png', 'image/png'],
    ['site.jpg', 'jpg', 'image/jpeg'],
    ['site.jpeg', 'jpg', 'image/jpeg'],
  ])('%s is stored as .%s with %s', (name, extension, contentType) => {
    expect(imageTypeOfName(name)).toMatchObject({ extension, contentType });
  });

  it.each(['plan.pdf', 'drawing.dwg', 'photo', 'photo.', '.png', 'a.png.exe'])(
    '%s is not an allowed name',
    (name) => {
      expect(imageTypeOfName(name)).toBeNull();
    },
  );

  it('does not read an inherited property as an extension', () => {
    expect(imageTypeOfName('x.constructor')).toBeNull();
    expect(imageTypeOfName('x.__proto__')).toBeNull();
  });

  it('accepts the bytes of the type the name claims and nothing else', () => {
    const png = typeOf('a.png');
    const jpeg = typeOf('a.jpg');
    expect(hasImageSignature(png, PNG)).toBe(true);
    expect(hasImageSignature(jpeg, JPEG)).toBe(true);
    expect(hasImageSignature(png, PDF)).toBe(false);
    expect(hasImageSignature(png, JPEG)).toBe(false);
    expect(hasImageSignature(jpeg, PNG)).toBe(false);
    expect(hasImageSignature(png, Buffer.alloc(0))).toBe(false);
    expect(hasImageSignature(jpeg, Buffer.from([0xff, 0xd8]))).toBe(false);
  });

  it('reads the extension in lower case, or none', () => {
    expect(extensionOf('a.JPG')).toBe('jpg');
    expect(extensionOf('noext')).toBeNull();
  });
});

describe('photo display name', () => {
  it('drops path parts and control characters', () => {
    expect(sanitizePhotoName('..\\..\\etc/passwd.png')).toBe('passwd.png');
    expect(sanitizePhotoName('a\u0000b\r\n.png')).toBe('ab.png');
  });

  it('replaces characters that break a header', () => {
    expect(sanitizePhotoName('a"b;c<d>.png')).toBe('a_b_c_d_.png');
  });

  it('restores a UTF-8 name read as latin1', () => {
    const mojibake = Buffer.from('tủ điện.png', 'utf8').toString('latin1');
    expect(sanitizePhotoName(mojibake)).toBe('tủ điện.png');
  });

  it('falls back to a name when nothing is left and caps the length keeping the extension', () => {
    expect(sanitizePhotoName('///')).toBe('photo');
    const long = sanitizePhotoName(`${'a'.repeat(400)}.png`);
    expect(long).toHaveLength(150);
    expect(long.endsWith('.png')).toBe(true);
  });
});
