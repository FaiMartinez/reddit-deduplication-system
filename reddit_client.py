import praw
from prawcore.exceptions import ResponseException, OAuthException
import urllib.parse
from datetime import datetime
import os
from dotenv import load_dotenv
from image_processor import ImageProcessor
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()

class RedditClient:
    def __init__(self):
        try:
            self.reddit = praw.Reddit(
                client_id=os.getenv('REDDIT_CLIENT_ID'),
                client_secret=os.getenv('REDDIT_CLIENT_SECRET'),
                user_agent=os.getenv('REDDIT_USER_AGENT', 'python:image-deduplication-system:v1.0'),
                read_only=True  # Explicitly set read-only mode
            )
            # Test authentication
            self.reddit.user.me()
            logger.info("Successfully authenticated with Reddit")
            self.processor = ImageProcessor()
        except (ResponseException, OAuthException) as e:
            logger.error(f"Reddit authentication failed: {str(e)}")
            raise Exception("Failed to authenticate with Reddit. Please check your API credentials.")

    def clean_reddit_url(self, url):
        """Clean Reddit URLs by removing query params and converting to i.redd.it"""
        if not url:
            return None

        # Handle /media?url= format
        if '/media?url=' in url:
            url = urllib.parse.unquote(url.split('/media?url=')[1])
        
        try:
            # Parse and normalize the URL
            parsed = urllib.parse.urlparse(url)
            # Clean the path component
            path = urllib.parse.unquote(parsed.path)
            # Get just the filename part of the path
            filename = path.split('/')[-1]
            # Remove everything after the first question mark
            filename = filename.split('?')[0]
            # Build the clean i.redd.it URL
            clean_url = f"https://i.redd.it/{filename}"
            logger.debug(f"Cleaned URL: {url} -> {clean_url}")
            return clean_url
        except Exception as e:
            logger.error(f"Error cleaning URL {url}: {str(e)}")
            # If URL cleaning fails, return original without query params
            base_url = url.split('?')[0]
            return base_url.replace('preview.redd.it', 'i.redd.it')

    def extract_image_url(self, submission):
        """Extract image URL from various Reddit post types"""
        try:
            # Skip videos
            if submission.is_video:
                return None

            supported_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
            
            # Handle gallery posts first
            if hasattr(submission, 'gallery_data') and submission.gallery_data:
                logger.info(f"Found gallery post with {len(submission.gallery_data['items'])} items")
                if hasattr(submission, 'media_metadata'):
                    for item in submission.gallery_data['items']:
                        media_id = item['media_id']
                        if media_id in submission.media_metadata:
                            media_item = submission.media_metadata[media_id]
                            if media_item['e'] == 'Image':
                                return media_item['s']['u']
                return None

            # Check for Reddit-hosted images (i.redd.it)
            if 'i.redd.it' in submission.url:
                if any(submission.url.lower().endswith(ext) for ext in supported_extensions):
                    logger.info(f"Found Reddit-hosted image: {submission.url}")
                    return submission.url

            # Check for preview images
            if hasattr(submission, 'preview'):
                if 'images' in submission.preview and submission.preview['images']:
                    image_data = submission.preview['images'][0]['source']
                    if 'url' in image_data:
                        logger.info(f"Found preview image: {image_data['url']}")
                        return image_data['url']

            # Check media_metadata for single images
            if hasattr(submission, 'media_metadata'):
                for image_id in submission.media_metadata:
                    item = submission.media_metadata[image_id]
                    if item.get('e') == 'Image':
                        logger.info(f"Found image in media_metadata")
                        return item['s']['u']

            # Direct URL check for supported extensions
            if any(submission.url.lower().endswith(ext) for ext in supported_extensions):
                logger.info(f"Found direct image URL: {submission.url}")
                return submission.url

            # Last resort: check if URL points to a Reddit post with an image
            if 'reddit.com' in submission.url and hasattr(submission, 'crosspost_parent'):
                try:
                    crosspost = self.reddit.submission(id=submission.crosspost_parent.split('_')[1])
                    return self.extract_image_url(crosspost)
                except:
                    pass

            return None
        except Exception as e:
            logger.error(f"Error extracting image URL from submission {submission.id}: {str(e)}")
            return None    
    def find_duplicates(self, image_hashes, subreddits=None):
        """
        Search for duplicate images in specified subreddit(s).
        
        Args:
            image_hashes: Hash(es) of the image to search for
            subreddits: String, list, or set of subreddit names to search in. If None, defaults to 'Philippines'
            
        Returns:
            List of dictionaries containing information about matching posts
        """
        try:
            matches = []
            total_processed = 0
            total_images = 0
            failed_downloads = 0
            
            # Default to Philippines if no subreddit specified
            if subreddits is None:
                subreddits = ['Philippines']
                
            if not self.reddit:
                raise Exception("Reddit client not properly initialized")
            
            # Convert input to list if it's a string or set
            if isinstance(subreddits, (str, set)):
                subreddits = list(subreddits) if isinstance(subreddits, set) else [subreddits]
            
            # Validate all subreddit names before processing
            for subreddit_name in subreddits:
                try:
                    # Try to fetch basic info about the subreddit to verify it exists
                    sub_info = self.reddit.subreddit(subreddit_name).id
                    if not sub_info:
                        raise Exception(f"Subreddit r/{subreddit_name} not found")
                except Exception as e:
                    logger.error(f"Invalid subreddit: r/{subreddit_name} - {str(e)}")
                    raise Exception(f"Subreddit r/{subreddit_name} not found or is private")

            # Process each subreddit
            for subreddit_name in subreddits:
                logger.info(f"Scanning subreddit: r/{subreddit_name}")
                posts_processed = 0
                subreddit_failures = 0
                
                try:
                    subreddit = self.reddit.subreddit(subreddit_name)
                    
                    # Search through more posts to ensure we don't miss anything
                    for submission in subreddit.hot(limit=50):
                        total_processed += 1
                        image_url = self.extract_image_url(submission)
                        
                        if image_url:
                            total_images += 1
                            logger.info(f"Found image in post '{submission.title}' - URL: {image_url}")
                            try:
                                logger.debug(f"Attempting to download and process image from: {image_url}")
                                submission_hashes = self.processor.hash_from_url(image_url)
                                posts_processed += 1
                                
                                if self.processor.compare_hashes(image_hashes, submission_hashes):
                                    logger.info(f"Found potential duplicate in r/{subreddit_name}: {submission.title}")
                                    matches.append({
                                        'id': submission.id,
                                        'title': submission.title,
                                        'author': str(submission.author),
                                        'date': datetime.fromtimestamp(submission.created_utc).isoformat(),
                                        'reddit_url': f"https://reddit.com{submission.permalink}",
                                        'image_url': image_url,
                                        'subreddit': subreddit_name
                                    })
                            except Exception as e:
                                failed_downloads += 1
                                subreddit_failures += 1
                                logger.error(f"Failed to process image from {image_url} in submission {submission.id}: {str(e)}")
                except Exception as e:
                    logger.error(f"Error processing subreddit r/{subreddit_name}: {str(e)}")
                    continue
                
                logger.info(f"Subreddit r/{subreddit_name} summary:")
                logger.info(f"- Successfully processed: {posts_processed} images")
                logger.info(f"- Failed downloads: {subreddit_failures}")
            
            logger.info("\nScan Complete - Summary:")
            logger.info(f"Total posts checked: {total_processed}")
            logger.info(f"Total images found: {total_images}")
            logger.info(f"Successfully processed: {total_images - failed_downloads}")
            logger.info(f"Failed downloads: {failed_downloads}")
            logger.info(f"Potential matches found: {len(matches)}")
            
            return matches
            
        except ResponseException as e:
            logger.error(f"Reddit API error: {str(e)}")
            raise Exception(f"Reddit API error: {str(e)}")
        except Exception as e:
            logger.error(f"Error searching Reddit: {str(e)}")
            raise Exception(f"Error searching Reddit: {str(e)}")    
    def find_duplicates_from_url(self, reddit_url, subreddits=None):
        """Extract image from a Reddit post URL and find duplicates in specified subreddits"""
        try:
            # Extract submission ID from the URL
            parts = reddit_url.split('comments/')
            if len(parts) < 2:
                raise Exception("Invalid Reddit post URL")
            
            submission_id = parts[1].split('/')[0]
            submission = self.reddit.submission(id=submission_id)
            
            # Get image URL from the submission
            image_url = self.extract_image_url(submission)
            if not image_url:
                raise Exception("No image found in the Reddit post")
            
            # Get image hash and search for duplicates
            image_hashes = self.processor.hash_from_url(image_url)
            return self.find_duplicates(image_hashes, subreddits)
            
        except Exception as e:
            logger.error(f"Error processing Reddit URL: {str(e)}")
            raise Exception(f"Failed to process Reddit post: {str(e)}")

    def get_image_hash(self, url):
        return self.processor.hash_from_url(url)

    def report_post(self, post_id):
        try:
            submission = self.reddit.submission(id=post_id)
            submission.report('Potential repost')
            return {'success': True, 'message': 'Post reported successfully'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
