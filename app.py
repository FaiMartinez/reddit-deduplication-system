from flask import Flask, render_template, request, jsonify
from image_processor import ImageProcessor
from reddit_client import RedditClient
import os
import re

app = Flask(__name__)
image_processor = ImageProcessor()
reddit_client = RedditClient()

@app.route('/')
def index():
    return render_template('landing.html')

@app.route('/main')
def main():
    return render_template('main.html')

@app.route('/api/check-duplicates', methods=['POST'])
def check_duplicates():
    try:
        image_url = request.form.get('image_url')
        uploaded_file = request.files.get('image')
        subreddits = request.form.getlist('subreddit[]')  # Get list of subreddits

        if not subreddits:
            return jsonify({'error': 'No subreddits provided'}), 400

        # Validate each subreddit name
        subreddit_regex = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_]{2,20}$')
        for subreddit in subreddits:
            if not subreddit_regex.match(subreddit):
                return jsonify({'error': f'Invalid subreddit name: {subreddit}'}), 400
            
        if not image_url and not uploaded_file:
            return jsonify({'error': 'No image or URL provided'}), 400
            
        # Add protocol if missing
        if image_url and not image_url.startswith(('http://', 'https://')):
            image_url = 'https://' + image_url

        if image_url:
            try:                # Handle Reddit URLs
                if 'reddit.com' in image_url and 'comments/' in image_url:
                    # It's a Reddit post URL
                    results = reddit_client.find_duplicates_from_url(image_url, subreddits)
                elif 'preview.redd.it' in image_url or '/media?url=' in image_url or 'i.redd.it' in image_url:
                    # Handle preview URLs directly
                    clean_url = reddit_client.clean_reddit_url(image_url)
                    image_hash = image_processor.hash_from_url(clean_url)
                    results = reddit_client.find_duplicates(image_hash, subreddits)
                else:
                    # Regular image URL
                    image_hash = image_processor.hash_from_url(image_url)
                    results = reddit_client.find_duplicates(image_hash, subreddits)
                
                return jsonify({
                    'success': True,
                    'results': results,
                    'count': len(results)
                })
            except Exception as e:
                return jsonify({
                    'error': str(e),
                    'details': 'Failed to process URL. Make sure it points to a valid Reddit post or image.'
                }), 400
        else:
            try:
                if not uploaded_file.filename:
                    return jsonify({'error': 'No file selected'}), 400
                    
                # Validate file extension
                allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
                ext = os.path.splitext(uploaded_file.filename)[1].lower()
                if ext not in allowed_extensions:
                    return jsonify({
                        'error': 'Invalid file type',
                        'details': f'Allowed file types are: {", ".join(allowed_extensions)}'
                    }), 400
                image_hash = image_processor.hash_from_file(uploaded_file)
                results = reddit_client.find_duplicates(image_hash, subreddits)
                return jsonify({
                    'success': True,
                    'results': results,
                    'count': len(results)
                })
            except Exception as e:
                return jsonify({
                    'error': 'Failed to process image',
                    'details': str(e)
                }), 400
    except Exception as e:
        return jsonify({
            'error': 'An unexpected error occurred',
            'details': str(e)
        }), 500

@app.route('/api/report', methods=['POST'])
def report_post():
    try:
        post_id = request.form.get('post_id')
        if not post_id:
            return jsonify({'error': 'No post ID provided'}), 400
        
        result = reddit_client.report_post(post_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Use environment variable for port with a default value
    port = int(os.environ.get('PORT', 5000))
    # In production, debug should be False
    debug = os.environ.get('FLASK_ENV', 'production') == 'development'
    app.run(host='0.0.0.0', port=port, debug=debug)
