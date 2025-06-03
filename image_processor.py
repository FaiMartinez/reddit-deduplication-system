import requests
import numpy as np
from PIL import Image
import imagehash
from io import BytesIO
import urllib.parse
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Increase maximum image size limit to 200MP (adjust as needed)
Image.MAX_IMAGE_PIXELS = 200000000  # 200 million pixels

class ImageProcessor:
    def __init__(self):
        # Higher hash size for more detail
        self.hash_size = 16
        # More lenient threshold for hamming distance (0-256, lower means more similar)
        self.threshold = 15

    def compute_image_hashes(self, image):
        """Compute multiple types of hashes for better accuracy"""
        phash = imagehash.phash(image, hash_size=self.hash_size)
        dhash = imagehash.dhash(image, hash_size=self.hash_size)
        ahash = imagehash.average_hash(image, hash_size=self.hash_size)
        return {
            'phash': str(phash),
            'dhash': str(dhash),
            'ahash': str(ahash)
        }

    def hash_from_url(self, url):
        # Decode URL-encoded characters
        decoded_url = urllib.parse.unquote(url)
        
        try:
            logger.info(f"Downloading image from: {decoded_url}")
            response = requests.get(decoded_url, headers={
                'User-Agent': 'RedditImageDuplicateChecker/1.0'
            }, timeout=10)  # Added timeout
            response.raise_for_status()
            
            # Verify content type is an image
            content_type = response.headers.get('content-type', '')
            if not content_type.startswith('image/'):
                raise Exception(f"URL does not point to an image. Content-Type: {content_type}")
            
            # Verify content length is reasonable (between 1KB and 20MB)
            content_length = int(response.headers.get('content-length', 0))
            if not (1024 <= content_length <= 20 * 1024 * 1024):
                raise Exception(f"Image size ({content_length} bytes) is outside acceptable range")
            
            logger.info(f"Successfully downloaded image ({content_length} bytes)")
            
            image = Image.open(BytesIO(response.content))
            # Convert image to RGB if it's in RGBA mode
            if image.mode == 'RGBA':
                image = image.convert('RGB')
                logger.debug("Converted RGBA image to RGB")
            
            # Log image details
            logger.info(f"Image size: {image.size}, Mode: {image.mode}")
            
            hashes = self.compute_image_hashes(image)
            logger.debug(f"Generated hashes: {hashes}")
            return hashes
        except requests.Timeout:
            logger.error(f"Timeout downloading image from {url}")
            raise Exception("Image download timed out")
        except requests.RequestException as e:
            logger.error(f"Failed to download image from {url}: {str(e)}")
            raise Exception(f"Failed to download image: {str(e)}")
        except Exception as e:
            logger.error(f"Failed to process image from URL {url}: {str(e)}")
            raise Exception(f"Failed to process image: {str(e)}")

    def hash_from_file(self, file):
        try:
            image = Image.open(file)
            if image.mode == 'RGBA':
                image = image.convert('RGB')
            hashes = self.compute_image_hashes(image)
            logger.debug(f"Successfully processed uploaded file")
            logger.debug(f"Generated hashes: {hashes}")
            return hashes
        except Exception as e:
            logger.error(f"Failed to process uploaded file: {str(e)}")
            raise Exception(f"Failed to process image file: {str(e)}")

    def compare_hashes(self, hashes1, hashes2):
        try:
            # Compare each type of hash
            phash_diff = self._hamming_distance(hashes1['phash'], hashes2['phash'])
            dhash_diff = self._hamming_distance(hashes1['dhash'], hashes2['dhash'])
            ahash_diff = self._hamming_distance(hashes1['ahash'], hashes2['ahash'])
            
            # Get the minimum difference (best match) among all hash types
            min_diff = min(phash_diff, dhash_diff, ahash_diff)
            
            is_match = min_diff <= self.threshold
            if is_match:
                logger.info(f"Found matching image with differences - pHash: {phash_diff}, dHash: {dhash_diff}, aHash: {ahash_diff}")
            return is_match
        except Exception as e:
            logger.error(f"Error comparing hashes: {str(e)}")
            return False
    
    def _hamming_distance(self, hash1_str, hash2_str):
        """Calculate the Hamming distance between two hash strings"""
        try:
            hash1 = int(hash1_str, 16)
            hash2 = int(hash2_str, 16)
            xor = bin(hash1 ^ hash2)
            return xor.count('1')
        except ValueError as e:
            logger.error(f"Error calculating hamming distance: {str(e)}")
            return float('inf')
