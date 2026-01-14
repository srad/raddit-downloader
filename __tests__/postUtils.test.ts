import { getExtensionFromUrl } from '../src/utils/postUtils';

describe('getExtensionFromUrl', () => {
  it('should extract extension from simple URL', () => {
    expect(getExtensionFromUrl('https://example.com/video.mp4')).toBe('mp4');
    expect(getExtensionFromUrl('https://example.com/image.jpg')).toBe('jpg');
    expect(getExtensionFromUrl('https://example.com/file.webm')).toBe('webm');
  });

  it('should handle URLs with query parameters', () => {
    expect(getExtensionFromUrl('https://example.com/video.mp4?quality=high')).toBe('mp4');
    expect(getExtensionFromUrl('https://example.com/image.jpg?w=1920&h=1080')).toBe('jpg');
  });

  it('should handle URLs with hash fragments', () => {
    expect(getExtensionFromUrl('https://example.com/video.mp4#timestamp=30')).toBe('mp4');
    expect(getExtensionFromUrl('https://example.com/image.jpg#section')).toBe('jpg');
  });

  it('should handle URLs with both query and hash', () => {
    expect(getExtensionFromUrl('https://example.com/video.mp4?q=hd#t=10')).toBe('mp4');
  });

  it('should handle RedGifs URLs', () => {
    expect(getExtensionFromUrl('https://thumbs2.redgifs.com/SomeVideo.mp4')).toBe('mp4');
    expect(getExtensionFromUrl('https://thumbs2.redgifs.com/SomeVideo.webm?param=value')).toBe('webm');
  });

  it('should handle Gfycat URLs', () => {
    expect(getExtensionFromUrl('https://giant.gfycat.com/SomeVideo.mp4')).toBe('mp4');
  });

  it('should return null when no extension found', () => {
    expect(getExtensionFromUrl('https://example.com/noextension')).toBeNull();
    expect(getExtensionFromUrl('https://example.com/')).toBeNull();
    expect(getExtensionFromUrl('https://example.com/path/to/file')).toBeNull();
  });

  it('should handle complex URLs with multiple parameters', () => {
    expect(getExtensionFromUrl('https://example.com/video.mp4?quality=hd&format=h264&token=abc123')).toBe('mp4');
    expect(getExtensionFromUrl('https://cdn.example.com/media/file.webm?auth=token&expires=123456')).toBe('webm');
    expect(getExtensionFromUrl('https://thumbs.redgifs.com/SomeVideo-mobile.mp4?key1=val1&key2=val2&key3=val3')).toBe('mp4');
  });

  it('should return null when extension is only in query parameters', () => {
    // Extension in query param, not in path - should return null
    expect(getExtensionFromUrl('https://api.example.com/download?file=test.webm&auth=token')).toBeNull();
    expect(getExtensionFromUrl('https://example.com/api/get?format=mp4')).toBeNull();
  });

  it('should return null for URLs with suspicious extensions', () => {
    expect(getExtensionFromUrl('https://example.com/file.x')).toBeNull(); // Too short
    expect(getExtensionFromUrl('https://example.com/file.toolong')).toBeNull(); // Too long
    expect(getExtensionFromUrl('https://example.com/file.mp4/something')).toBeNull(); // Extension followed by slash
  });

  it('should handle uppercase extensions', () => {
    expect(getExtensionFromUrl('https://example.com/VIDEO.MP4')).toBe('mp4');
    expect(getExtensionFromUrl('https://example.com/IMAGE.JPG')).toBe('jpg');
  });

  it('should handle mixed case extensions', () => {
    expect(getExtensionFromUrl('https://example.com/file.MpEg')).toBe('mpeg');
  });
});
