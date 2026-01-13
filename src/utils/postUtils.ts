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

export function getMediaDownloadInfo(post: RedditPost): {
  downloadURL: string;
  fileType: string;
} {
  let downloadURL = post.url;
  let fileType = downloadURL.split('.').pop() || '';

  if (post.preview !== undefined) {
    if (post.preview.reddit_video_preview !== undefined) {
      downloadURL = post.preview.reddit_video_preview.fallback_url;
      fileType = 'mp4';
    } else if (post.url_overridden_by_dest?.includes('.gifv')) {
      downloadURL = post.url_overridden_by_dest.replace('.gifv', '.mp4');
      fileType = 'mp4';
    } else if (post.preview.images?.[0]?.source?.url) {
      const sourceURL = post.preview.images[0].source.url;
      for (const format of MEDIA_FORMATS) {
        if (sourceURL.toLowerCase().includes(format.toLowerCase())) {
          fileType = format;
          break;
        }
      }
    }
  }

  if (post.media !== undefined && post.post_hint === 'hosted:video') {
    downloadURL = post.media.reddit_video?.fallback_url || downloadURL;
    fileType = 'mp4';
  } else if (
    post.media !== undefined &&
    post.post_hint === 'rich:video' &&
    post.media.oembed?.thumbnail_url !== undefined
  ) {
    downloadURL = post.media.oembed.thumbnail_url;
    fileType = 'gif';
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
