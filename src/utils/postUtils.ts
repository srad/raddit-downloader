import {RedditPost} from '../types';
import {DEBUG} from '../config/constants';

export const MEDIA_FORMATS = ['jpeg', 'jpg', 'gif', 'png', 'mp4', 'webm', 'gifv'];

export enum PostType {
  Self = 0,
  Media = 1,
  Link = 2,
  Poll = 3,
  Gallery = 4,
}

export function getPostType(post: RedditPost): PostType {
  if (post.post_hint === 'self' || post.is_self) {
    return PostType.Self;
  }

  if (
    post.post_hint === 'image' ||
    (post.post_hint === 'rich:video' && !post.domain.includes('youtu')) ||
    post.post_hint === 'hosted:video' ||
    (post.post_hint === 'link' &&
      post.domain.includes('imgur') &&
      !post.url_overridden_by_dest?.includes('gallery')) ||
    post.domain.includes('i.redd.it') ||
    post.domain.includes('i.reddituploads.com')
  ) {
    return PostType.Media;
  }

  if (post.poll_data !== undefined) {
    return PostType.Poll;
  }

  if (post.domain.includes('reddit.com') && post.is_gallery) {
    return PostType.Gallery;
  }

  return PostType.Link;
}

export function getPostTypeName(type: PostType): string {
  switch (type) {
    case PostType.Self:
      return 'self';
    case PostType.Media:
      return 'media';
    case PostType.Link:
      return 'link';
    case PostType.Poll:
      return 'poll';
    case PostType.Gallery:
      return 'gallery';
    default:
      return 'unknown';
  }
}

/**
 * Extract file extension from URL (strips query params and hash)
 * Returns null if no valid extension can be determined
 */
export function getExtensionFromUrl(url: string): string | null {
  const urlWithoutParams = url.split('?')[0].split('#')[0];
  const parts = urlWithoutParams.split('.');

  if (parts.length < 2) {
    return null; // No extension found
  }

  const lastPart = parts.pop();
  if (!lastPart) {
    return null;
  }

  // Check if the last part is actually a file extension (no slashes, reasonable length)
  // Valid extensions are typically 2-5 characters and don't contain slashes or special chars
  if (lastPart.includes('/') || lastPart.length > 5 || lastPart.length < 2) {
    return null;
  }

  return lastPart.toLowerCase();
}

/**
 * Extracts the best quality download URL and file type from a Reddit post.
 * Priority order:
 * 1. media.reddit_video (Reddit-hosted videos, full quality)
 * 2. preview.images[0].source (Full-resolution images)
 * 3. .gifv conversion to .mp4
 * 4. preview.reddit_video_preview (Fallback for video previews)
 * 5. post.url (Original URL, may be direct link or embedding page)
 */
export function getMediaDownloadInfo(post: RedditPost): {
  downloadURL: string;
  fileType: string;
} {
  let downloadURL = post.url;

  let fileType: string | null = getExtensionFromUrl(downloadURL);

    // Debug: Log post structure for preview URLs
    if (DEBUG && downloadURL.includes('external-preview.redd.it')) {
    console.log('\n⚠️  WARNING: Got external-preview URL');
    console.log('Post URL:', post.url);
    console.log('URL Override:', post.url_overridden_by_dest);
    console.log('Has preview.images?', !!post.preview?.images);
    console.log('Has preview.images[0].source?', !!post.preview?.images?.[0]?.source);
    console.log('Has media.reddit_video?', !!post.media?.reddit_video);
    console.log('Post hint:', post.post_hint);
    console.log('Domain:', post.domain);
  }

  // PRIORITY 1: Reddit hosted videos (full quality, not preview)
  if (post.media?.reddit_video?.fallback_url) {
    downloadURL = post.media.reddit_video.fallback_url;
    fileType = 'mp4';
  }
  // PRIORITY 2: Check for url_overridden_by_dest (often the real URL for external links)
  else if (post.url_overridden_by_dest && !post.url_overridden_by_dest.includes('external-preview')) {
    downloadURL = post.url_overridden_by_dest;
    const ext = getExtensionFromUrl(downloadURL);
    if (ext) fileType = ext;
  }
  // PRIORITY 3: Check preview object for other media types
  else if (post.preview !== undefined) {
    // Convert .gifv links to .mp4 (Imgur animated images)
    if (post.url_overridden_by_dest?.includes('.gifv')) {
      downloadURL = post.url_overridden_by_dest.replace('.gifv', '.mp4');
      fileType = 'mp4';
    }
    // Use full-resolution source image (NOT resized previews)
    else if (post.preview.images?.[0]?.source?.url) {
      // Decode HTML entities (e.g., &amp; -> &)
      const sourceURL = post.preview.images[0].source.url.replace(/&amp;/g, '&');
      downloadURL = sourceURL;

      // Extract extension from clean URL
      const cleanUrl = sourceURL.split('?')[0];
      for (const format of MEDIA_FORMATS) {
        if (cleanUrl.toLowerCase().includes(`.${format.toLowerCase()}`)) {
          fileType = format;
          break;
        }
      }

      // Fallback: extract extension from URL
      if (!fileType || !MEDIA_FORMATS.includes(fileType)) {
        const ext = getExtensionFromUrl(sourceURL);
        if (ext) fileType = ext;
      }
    }
    // FALLBACK: Use video preview only if no better source available
    // Note: This may be lower quality than the original
    else if (post.preview.reddit_video_preview?.fallback_url) {
      downloadURL = post.preview.reddit_video_preview.fallback_url;
      fileType = 'mp4';
    }
  }

  // For rich:video (embedded content like Gfycat, Redgifs):
  // Falls back to post.url which may be a direct video link or an embedding page.
  // Embedding pages cannot be downloaded directly and will fail during fetch.
  // This is intentional - better to fail than download a low-quality thumbnail.

  // Final cleanup: decode any HTML entities
  downloadURL = downloadURL.replace(/&amp;/g, '&');

  // If we still don't have a valid file type, we can't safely download this
  if (!fileType) {
    throw new Error(`Unable to determine file type for URL: ${downloadURL}`);
  }

  return { downloadURL, fileType };
}

export function isUserProfile(target: string): boolean {
  return (
    target.includes('u/') || target.includes('user/') || target.includes('/u/')
  );
}

export function extractName(target: string): string {
  if (isUserProfile(target)) {
    if (target.includes('user/')) {
      return target.split('user/').pop() || '';
    }
    return target.split('u/').pop() || '';
  }
  return target;
}
