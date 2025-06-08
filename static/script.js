// Store selected subreddits
let selectedSubreddits = new Set();

document.getElementById('addSubredditBtn').addEventListener('click', () => {
    const subredditInput = document.getElementById('subredditInput');
    const subreddit = subredditInput.value.trim();
    
    // Validate subreddit name
    const subredditRegex = /^[A-Za-z0-9][A-Za-z0-9_]{2,20}$/;
    if (!subredditRegex.test(subreddit)) {
        showError('Invalid subreddit name. Must be 3-21 characters and contain only letters, numbers, and underscores.');
        return;
    }

    if (!selectedSubreddits.has(subreddit)) {
        selectedSubreddits.add(subreddit);
        updateSubredditDisplay();
        subredditInput.value = '';
        document.getElementById('confirmSubreddits').disabled = false;
    }
});

function updateSubredditDisplay() {
    const container = document.getElementById('selectedSubreddits');
    container.innerHTML = '';
    
    selectedSubreddits.forEach(subreddit => {
        const tag = document.createElement('div');
        tag.className = 'subreddit-tag';
        tag.innerHTML = `
            r/${subreddit}
            <button type="button" onclick="removeSubreddit('${subreddit}')">&times;</button>
        `;
        container.appendChild(tag);
    });
}

function removeSubreddit(subreddit) {
    selectedSubreddits.delete(subreddit);
    updateSubredditDisplay();
    document.getElementById('confirmSubreddits').disabled = selectedSubreddits.size === 0;
    document.getElementById('checkDuplicates').disabled = true;
}

document.getElementById('confirmSubreddits').addEventListener('click', () => {
    if (selectedSubreddits.size > 0) {
        document.getElementById('checkDuplicates').disabled = false;
        document.getElementById('subredditInput').disabled = true;
        document.getElementById('addSubredditBtn').disabled = true;
        document.getElementById('confirmSubreddits').disabled = true;
    }
});

document.getElementById('imageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    
    const formData = new FormData(e.target);
    const imageUrl = formData.get('image_url');
    const imageFile = formData.get('image');
    
    if (selectedSubreddits.size === 0) {
        showError('Please add and confirm at least one subreddit');
        return;
    }

    // Remove any existing subreddit fields
    formData.delete('subreddit[]');
    
    // Add each selected subreddit to the form data
    selectedSubreddits.forEach(subreddit => {
        formData.append('subreddit[]', subreddit);
    });

    if (!imageUrl && !imageFile.size) {
        showError('Please provide an image file, image URL, or Reddit post URL');
        return;
    }

    const isRedditUrl = imageUrl && isRedditPostUrl(imageUrl);
    const isImageUrl = imageUrl && !isRedditUrl && validateImageUrl(imageUrl);

    if (imageUrl && !isRedditUrl && !isImageUrl) {
        showError('Please provide a valid image URL (.jpg, .jpeg, .png, .gif, .webp) or Reddit post URL');
        return;
    }

    initializeResultsContainer();
    showProgress(isRedditUrl);

    try {
        const response = await fetch('/api/check-duplicates', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to check duplicates');
        }
        
        displayResults(data.results);
    } catch (error) {
        showDetailedError({
            message: error.message || 'An unexpected error occurred',
            details: error.details || ''
        });
        clearResults();
    } finally {
        hideProgress();
    }
});

// File input preview
document.getElementById('imageFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            showPreview(e.target.result);
            document.getElementById('imageUrl').value = ''; // Clear URL input
        }
        reader.readAsDataURL(file);
    } else {
        hidePreview();
    }
});

// URL input preview
document.getElementById('imageUrl').addEventListener('input', function(e) {
    const url = e.target.value.trim();
    if (url && validateImageUrl(url)) {
        showPreview(url);
        document.getElementById('imageFile').value = ''; // Clear file input
    } else {
        hidePreview();
    }
});

// Clear preview button
document.getElementById('clearPreview').addEventListener('click', function(e) {
    e.preventDefault();
    hidePreview();
    document.getElementById('imageFile').value = '';
    document.getElementById('imageUrl').value = '';
});

function validateImageUrl(url) {
    try {
        const urlObj = new URL(url);
        
        // Support for various platforms
        const supportedDomains = [
            'reddit.com', 'i.redd.it', 'preview.redd.it',
            'imgur.com', 'i.imgur.com',
            'gfycat.com',
            'media.discordapp.net', 'cdn.discordapp.com',
            'pbs.twimg.com'
        ];
        
        // Check if URL is from a supported domain
        const isSupported = supportedDomains.some(domain => 
            urlObj.hostname.includes(domain));
            
        if (isSupported) {
            return true;
        }
        
        // For other domains, check if it's a direct image URL
        return url.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null;
    } catch (e) {
        return false;
    }
}

function isRedditPostUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.includes('reddit.com') && url.includes('/comments/');
    } catch (e) {
        return false;
    }
}

function initializeResultsContainer() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.style.display = 'block';

    const originalPostDiv = document.getElementById('originalPost');
    const duplicatesDiv = document.getElementById('duplicates');
    
    originalPostDiv.innerHTML = '<h2 class="section-title">Original Post</h2>';
    duplicatesDiv.innerHTML = '';
}

function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    const originalPostDiv = document.getElementById('originalPost');
    const duplicatesDiv = document.getElementById('duplicates');
    const duplicatesContainer = document.getElementById('duplicatesContainer');

    resultsDiv.style.display = 'block';

    if (!results || results.length === 0) {
        originalPostDiv.innerHTML += '<p class="no-results">No duplicates found</p>';
        duplicatesContainer.style.display = 'none';
        return;
    }

    // Sort posts by date (oldest first)
    const sortedPosts = results.sort((a, b) => new Date(a.date) - new Date(b.date));
    const originalPost = sortedPosts[0];
    const duplicates = sortedPosts.slice(1);

    // Display original post
    originalPostDiv.appendChild(createPostElement(originalPost, true));

    // Display duplicates
    if (duplicates.length > 0) {
        duplicatesContainer.style.display = 'block';
        duplicates.forEach(post => {
            duplicatesDiv.appendChild(createPostElement(post, false));
        });
    } else {
        duplicatesContainer.style.display = 'none';
    }
}

function createPostElement(post, isOriginal) {
    const template = document.getElementById('postTemplate');
    const element = template.content.cloneNode(true);
    
    const card = element.querySelector('.post-card');
    const image = element.querySelector('.post-image');
    const title = element.querySelector('.post-title');
    const date = element.querySelector('.post-date');
    const author = element.querySelector('.post-author');
    const link = element.querySelector('.post-link');
    const reportButton = element.querySelector('.report-button');
    
    image.src = post.image_url;
    image.alt = post.title;
    title.textContent = post.title;
    date.textContent = new Date(post.date).toLocaleDateString();
    author.textContent = `Posted by u/${post.author}`;
    link.href = post.reddit_url;
    
    if (isOriginal) {
        card.classList.add('original');
    }

    reportButton.addEventListener('click', () => reportPost(post.id));
    
    return element;
}

async function reportPost(postId) {
    try {
        const response = await fetch('/api/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `post_id=${postId}`
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to report post');
        }
        
        alert('Post reported successfully');
    } catch (error) {
        showError(error.message);
    }
}

function validateImageUrl(url) {
    try {
        new URL(url);
        return url.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null;
    } catch (e) {
        return false;
    }
}

function isRedditPostUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.includes('reddit.com') && url.includes('/comments/');
    } catch (e) {
        return false;
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function showDetailedError(error) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.innerHTML = `
        <strong>${error.message}</strong>
        ${error.details ? `<div class="error-details">${error.details}</div>` : ''}
    `;
    errorDiv.classList.add('detailed');
    errorDiv.style.display = 'block';
}

function clearError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.innerHTML = '';
    errorDiv.classList.remove('detailed');
    errorDiv.style.display = 'none';
}

function clearResults() {
    const resultsDiv = document.getElementById('results');
    const originalPostDiv = document.getElementById('originalPost');
    const duplicatesDiv = document.getElementById('duplicates');
    const duplicatesContainer = document.getElementById('duplicatesContainer');
    
    resultsDiv.style.display = 'none';
    originalPostDiv.innerHTML = '<h2 class="section-title">Original Post</h2>';
    duplicatesDiv.innerHTML = '';
    duplicatesContainer.style.display = 'none';
}

function showProgress(isRedditUrl) {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const progressContainer = document.querySelector('.progress-container');
    const progressBar = document.querySelector('.progress');
    const progressText = document.querySelector('.progress-text');
    const steps = document.querySelectorAll('.step');
    
    loadingSpinner.style.display = 'flex';
    progressContainer.style.display = 'block';
    document.getElementById('results').style.display = 'none';
    
    progressBar.style.width = '0%';
    steps.forEach(step => step.classList.remove('active', 'completed'));
    
    let currentStep = 0;
    updateProgress(currentStep);
    
    progressText.textContent = isRedditUrl ? 'Fetching Reddit post...' : 'Processing image...';
    startProgressAnimation(isRedditUrl);
}

function updateProgress(step) {
    const steps = document.querySelectorAll('.step');
    const progressBar = document.querySelector('.progress');
    const progressText = document.querySelector('.progress-text');
    const texts = [
        'Downloading Image...',
        'Processing...',
        'Searching Reddit...',
        'Analyzing Results...'
    ];
    
    const progress = (step / (steps.length - 1)) * 100;
    progressBar.style.width = `${progress}%`;
    
    steps.forEach((stepEl, index) => {
        if (index < step) {
            stepEl.classList.add('completed');
            stepEl.classList.remove('active');
        } else if (index === step) {
            stepEl.classList.add('active');
            stepEl.classList.remove('completed');
        } else {
            stepEl.classList.remove('active', 'completed');
        }
    });
    
    progressText.textContent = texts[step];
}

function startProgressAnimation(isRedditUrl) {
    let step = 0;
    const steps = document.querySelectorAll('.step');
    const totalSteps = steps.length;
    const baseDelay = isRedditUrl ? 2000 : 1000;
    
    function nextStep() {
        if (step < totalSteps) {
            updateProgress(step);
            step++;
            setTimeout(nextStep, baseDelay);
        }
    }
    
    nextStep();
}

function hideProgress() {
    document.getElementById('loadingSpinner').style.display = 'none';
    document.querySelector('.progress-container').style.display = 'none';
}

// Image preview functionality
function showPreview(src) {
    const previewContainer = document.getElementById('imagePreview');
    const previewImage = document.getElementById('previewImage');
    previewImage.src = src;
    previewContainer.style.display = 'block';
}

function hidePreview() {
    const previewContainer = document.getElementById('imagePreview');
    const previewImage = document.getElementById('previewImage');
    previewImage.src = '';
    previewContainer.style.display = 'none';
}

// File input preview
document.getElementById('imageFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            showPreview(e.target.result);
            document.getElementById('imageUrl').value = '';
        }
        reader.readAsDataURL(file);
    } else {
        hidePreview();
    }
});

// URL input preview
document.getElementById('imageUrl').addEventListener('input', function(e) {
    const url = e.target.value.trim();
    if (url && validateImageUrl(url)) {
        showPreview(url);
        document.getElementById('imageFile').value = '';
    } else {
        hidePreview();
    }
});