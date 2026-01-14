import { RedditPost } from '../types';

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

  // Helper function to extract file extension from URL (strips query params and hash)
  const getExtensionFromUrl = (url: string): string => {
    const urlWithoutParams = url.split('?')[0].split('#')[0];
    const extension = urlWithoutParams.split('.').pop() || 'jpg';
    return extension.toLowerCase();
  };

  let fileType = getExtensionFromUrl(downloadURL);

  // PRIORITY 1: Reddit hosted videos (full quality, not preview)
  if (post.media?.reddit_video?.fallback_url) {
    downloadURL = post.media.reddit_video.fallback_url;
    fileType = 'mp4';
  }
  // PRIORITY 2: Check preview object for other media types
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
      if (!MEDIA_FORMATS.includes(fileType)) {
        fileType = getExtensionFromUrl(sourceURL);
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
